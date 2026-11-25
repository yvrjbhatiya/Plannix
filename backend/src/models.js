import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const opts = {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { versionKey: false, transform: (_d, r) => { r.id = String(r._id); delete r._id; delete r.password_hash; return r; } },
};
const ref = (m, extra = {}) => ({ type: Schema.Types.ObjectId, ref: m, ...extra });

export const User = model('User', new Schema({ name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, password_hash: { type: String, required: true }, avatar_url: String }, opts));
export const Board = model('Board', new Schema({ title: { type: String, required: true }, description: String, color: { type: String, default: '#5747cf' }, owner_id: ref('User', { required: true }) }, opts));
const memberSchema = new Schema({ board_id: ref('Board', { required: true }), user_id: ref('User', { required: true }), role: { type: String, enum: ['owner', 'admin', 'member'], required: true } }, opts);
memberSchema.index({ board_id: 1, user_id: 1 }, { unique: true });
export const Member = model('Member', memberSchema);
export const Column = model('Column', new Schema({ board_id: ref('Board', { required: true, index: true }), title: { type: String, required: true }, position: { type: Number, required: true } }, opts));
const taskSchema = new Schema({ board_id: ref('Board', { required: true, index: true }), column_id: ref('Column', { required: true }), title: { type: String, required: true }, description: String, priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' }, due_date: Date, assignee_id: ref('User', { default: null }), created_by: ref('User', { default: null }), position: { type: Number, required: true } }, opts);
taskSchema.index({ column_id: 1, position: 1 });
export const Task = model('Task', taskSchema);
const actSchema = new Schema({ board_id: ref('Board', { required: true }), user_id: ref('User', { default: null }), action: String, message: String, metadata: Schema.Types.Mixed }, opts);
actSchema.index({ board_id: 1, created_at: -1 });
export const Activity = model('Activity', actSchema);
