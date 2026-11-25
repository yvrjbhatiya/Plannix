import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Board, Member, Column, Task, Activity } from './models.js';
import { ApiError, wrap, signToken, requireAuth, requireBoardAccess } from './middleware.js';
import { emitToBoard, logActivity } from './realtime.js';
import * as ai from './services/aiService.js';

const r = Router();
const GAP = 1000;
const access = requireBoardAccess();
const manage = requireBoardAccess(['owner', 'admin']);
const need = (v, m) => { if (!v || !String(v).trim()) throw new ApiError(400, m); };
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pubUser = (u) => ({ id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url });

const serMany = async (tasks) => {
  const ids = [...new Set(tasks.map((t) => t.assignee_id && String(t.assignee_id)).filter(Boolean))];
  const us = ids.length ? await User.find({ _id: { $in: ids } }) : [];
  const m = new Map(us.map((u) => [u.id, u]));
  return tasks.map((t) => { const o = t.toJSON(); const u = o.assignee_id && m.get(String(o.assignee_id)); return { ...o, assignee_name: u?.name ?? null, assignee_email: u?.email ?? null, assignee_avatar: u?.avatar_url ?? null }; });
};
const ser = async (t) => (await serMany([t]))[0];

// ---- Auth ----
r.post('/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body; need(name, 'Name required'); need(email, 'Email required');
  if (!password || password.length < 6) throw new ApiError(400, 'Password must be 6+ chars');
  try {
    const u = await User.create({ name, email, password_hash: await bcrypt.hash(password, 10) });
    res.status(201).json({ user: pubUser(u), token: signToken(u.id) });
  } catch (e) { if (e.code === 11000) throw new ApiError(409, 'Email already registered'); throw e; }
}));
r.post('/auth/login', wrap(async (req, res) => {
  const u = await User.findOne({ email: String(req.body.email || '').toLowerCase().trim() });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password_hash))) throw new ApiError(401, 'Invalid credentials');
  res.json({ user: pubUser(u), token: signToken(u.id) });
}));
r.get('/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
r.get('/users/search', requireAuth, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim(); if (q.length < 2) return res.json({ users: [] });
  const re = new RegExp(esc(q), 'i');
  const users = await User.find({ $or: [{ name: re }, { email: re }] }).limit(10);
  res.json({ users: users.map(pubUser) });
}));

r.use(requireAuth);

// ---- Boards ----
r.get('/boards', wrap(async (req, res) => {
  const ms = (await Member.find({ user_id: req.user.id }).populate('board_id')).filter((m) => m.board_id);
  const counts = await Task.aggregate([{ $match: { board_id: { $in: ms.map((m) => m.board_id._id) } } }, { $group: { _id: '$board_id', n: { $sum: 1 } } }]);
  const cm = new Map(counts.map((c) => [String(c._id), c.n]));
  const mcs = await Member.aggregate([{ $match: { board_id: { $in: ms.map((m) => m.board_id._id) } } }, { $group: { _id: '$board_id', n: { $sum: 1 } } }]);
  const mm = new Map(mcs.map((c) => [String(c._id), c.n]));
  const boards = ms.map((m) => ({ ...m.board_id.toJSON(), role: m.role, is_owner: m.role === 'owner', task_count: cm.get(String(m.board_id._id)) || 0, member_count: mm.get(String(m.board_id._id)) || 1 }))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  res.json({ boards });
}));
r.post('/boards', wrap(async (req, res) => {
  const { title, description, color } = req.body; need(title, 'Title required');
  const board = await mongoose.connection.transaction(async (session) => {
    const [b] = await Board.create([{ title, description, color: color || undefined, owner_id: req.user.id }], { session });
    await Member.create([{ board_id: b.id, user_id: req.user.id, role: 'owner' }], { session });
    await Column.insertMany(['To Do', 'In Progress', 'Review', 'Done'].map((t, i) => ({ board_id: b.id, title: t, position: (i + 1) * GAP })), { session });
    return b;
  });
  await logActivity(board.id, req.user.id, 'board.created', `${req.user.name} created the board`);
  res.status(201).json({ board });
}));
r.get('/boards/:boardId', access, wrap(async (req, res) => {
  const id = req.params.boardId;
  const [board, columns, tasks, ms] = await Promise.all([
    Board.findById(id), Column.find({ board_id: id }).sort({ position: 1 }), Task.find({ board_id: id }).sort({ position: 1 }),
    Member.find({ board_id: id }).populate('user_id'),
  ]);
  const members = ms.filter((m) => m.user_id).map((m) => ({ ...pubUser(m.user_id), role: m.role, joined_at: m.created_at }));
  res.json({ board, columns, tasks: await serMany(tasks), members, role: req.role });
}));
r.patch('/boards/:boardId', manage, wrap(async (req, res) => {
  const b = await Board.findByIdAndUpdate(req.params.boardId, { $set: pick(req.body, ['title', 'description', 'color']) }, { new: true });
  emitToBoard(req.params.boardId, 'board:updated', b); res.json({ board: b });
}));
r.delete('/boards/:boardId', requireBoardAccess(['owner']), wrap(async (req, res) => {
  const id = req.params.boardId;
  await Promise.all([Task.deleteMany({ board_id: id }), Column.deleteMany({ board_id: id }), Member.deleteMany({ board_id: id }), Activity.deleteMany({ board_id: id }), Board.deleteOne({ _id: id })]);
  emitToBoard(id, 'board:deleted', { id }); res.status(204).end();
}));
r.get('/boards/:boardId/activity', access, wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const acts = await Activity.find({ board_id: req.params.boardId }).sort({ created_at: -1 }).limit(limit).populate('user_id', 'name avatar_url');
  res.json({ activities: acts.map((a) => ({ ...a.toJSON(), user_name: a.user_id?.name, user_avatar: a.user_id?.avatar_url, user_id: a.user_id?.id })) });
}));
r.post('/boards/:boardId/members', manage, wrap(async (req, res) => {
  const { email, userId } = req.body;
  const u = email ? await User.findOne({ email: String(email).toLowerCase().trim() }) : mongoose.isValidObjectId(userId) ? await User.findById(userId) : null;
  if (!u) throw new ApiError(404, 'No user with that email. They need to sign up first.');
  const role = req.body.role === 'admin' ? 'admin' : 'member';
  await Member.updateOne({ board_id: req.params.boardId, user_id: u.id }, { $setOnInsert: { role } }, { upsert: true });
  emitToBoard(req.params.boardId, 'board:updated', { id: req.params.boardId, membersChanged: true });
  await logActivity(req.params.boardId, req.user.id, 'member.added', `${req.user.name} added ${u.name} to the board`);
  res.status(201).json({ member: { ...pubUser(u), role, joined_at: new Date() } });
}));
r.delete('/boards/:boardId/members/:userId', manage, wrap(async (req, res) => {
  await Member.deleteOne({ board_id: req.params.boardId, user_id: req.params.userId, role: { $ne: 'owner' } });
  emitToBoard(req.params.boardId, 'board:updated', { id: req.params.boardId, membersChanged: true }); res.status(204).end();
}));

// ---- Columns ----
r.post('/boards/:boardId/columns', access, wrap(async (req, res) => {
  need(req.body.title, 'Title required');
  const last = await Column.findOne({ board_id: req.params.boardId }).sort({ position: -1 });
  const c = await Column.create({ board_id: req.params.boardId, title: req.body.title, position: (last?.position || 0) + GAP });
  emitToBoard(req.params.boardId, 'column:created', c); res.status(201).json({ column: c });
}));
r.patch('/boards/:boardId/columns/:columnId', access, wrap(async (req, res) => {
  const c = await Column.findOneAndUpdate({ _id: req.params.columnId, board_id: req.params.boardId }, { $set: pick(req.body, ['title', 'position']) }, { new: true });
  if (!c) throw new ApiError(404, 'Column not found');
  emitToBoard(req.params.boardId, 'column:updated', c); res.json({ column: c });
}));
r.delete('/boards/:boardId/columns/:columnId', access, wrap(async (req, res) => {
  const { boardId, columnId } = req.params;
  if ((await Column.deleteOne({ _id: columnId, board_id: boardId })).deletedCount) await Task.deleteMany({ column_id: columnId });
  emitToBoard(boardId, 'column:deleted', { id: columnId }); res.status(204).end();
}));

// ---- Tasks ----
async function insertTask(boardId, columnId, userId, t) {
  if (!mongoose.isValidObjectId(columnId) || !(await Column.exists({ _id: columnId, board_id: boardId }))) throw new ApiError(400, 'Invalid column');
  const last = await Task.findOne({ column_id: columnId }).sort({ position: -1 });
  const task = await Task.create({ board_id: boardId, column_id: columnId, title: t.title, description: t.description, priority: t.priority || 'medium', due_date: (t.dueDate ?? t.due_date) || null, assignee_id: (t.assigneeId ?? t.assignee_id) || null, created_by: userId, position: (last?.position || 0) + GAP });
  const out = await ser(task); emitToBoard(boardId, 'task:created', out); return out;
}
r.get('/boards/:boardId/tasks', access, wrap(async (req, res) => res.json({ tasks: await serMany(await Task.find({ board_id: req.params.boardId }).sort({ position: 1 })) })));
r.post('/boards/:boardId/tasks', access, wrap(async (req, res) => {
  need(req.body.title, 'Title required');
  const t = await insertTask(req.params.boardId, req.body.column_id ?? req.body.columnId, req.user.id, req.body);
  await logActivity(req.params.boardId, req.user.id, 'task.created', `${req.user.name} created "${t.title}"`, { taskId: t.id });
  res.status(201).json({ task: t });
}));
r.patch('/boards/:boardId/tasks/:taskId', access, wrap(async (req, res) => {
  const b = req.body, set = pick(b, ['title', 'priority', 'description']);
  if ('dueDate' in b || 'due_date' in b) set.due_date = (b.dueDate ?? b.due_date) || null;
  if ('assigneeId' in b || 'assignee_id' in b) set.assignee_id = (b.assigneeId ?? b.assignee_id) || null;
  const t = await Task.findOneAndUpdate({ _id: req.params.taskId, board_id: req.params.boardId }, { $set: set }, { new: true, runValidators: true });
  if (!t) throw new ApiError(404, 'Task not found');
  const out = await ser(t); emitToBoard(req.params.boardId, 'task:updated', out);
  await logActivity(req.params.boardId, req.user.id, 'task.updated', `${req.user.name} updated "${t.title}"`);
  res.json({ task: out });
}));
r.patch('/boards/:boardId/tasks/:taskId/move', access, wrap(async (req, res) => {
  const columnId = req.body.column_id ?? req.body.columnId, { position } = req.body;
  if (typeof position !== 'number') throw new ApiError(400, 'position (number) required');
  if (!mongoose.isValidObjectId(columnId) || !(await Column.exists({ _id: columnId, board_id: req.params.boardId }))) throw new ApiError(404, 'Column not found');
  const t = await Task.findOneAndUpdate({ _id: req.params.taskId, board_id: req.params.boardId }, { $set: { column_id: columnId, position } }, { new: true });
  if (!t) throw new ApiError(404, 'Task not found');
  const out = await ser(t); emitToBoard(req.params.boardId, 'task:moved', out);
  const col = await Column.findById(columnId);
  await logActivity(req.params.boardId, req.user.id, 'task.moved', `${req.user.name} moved "${t.title}" to ${col?.title || 'another column'}`);
  res.json({ task: out });
}));
r.delete('/boards/:boardId/tasks/:taskId', access, wrap(async (req, res) => {
  const t = await Task.findOneAndDelete({ _id: req.params.taskId, board_id: req.params.boardId });
  emitToBoard(req.params.boardId, 'task:deleted', { id: req.params.taskId });
  if (t) await logActivity(req.params.boardId, req.user.id, 'task.deleted', `${req.user.name} deleted "${t.title}"`);
  res.status(204).end();
}));

// ---- AI ----
r.post('/boards/:boardId/ai/generate-tasks', access, wrap(async (req, res) => {
  const { goal, count, preview } = req.body, columnId = req.body.column_id ?? req.body.columnId; need(goal, 'Goal required');
  const tasks = await ai.generateTasks(goal, Number(count) || 8);
  if (preview || !columnId) return res.json({ tasks });
  const created = []; for (const t of tasks) created.push(await insertTask(req.params.boardId, columnId, req.user.id, t));
  await logActivity(req.params.boardId, req.user.id, 'ai.generated', `${req.user.name} generated ${created.length} tasks with AI`);
  res.status(201).json({ tasks: created });
}));
r.post('/boards/:boardId/ai/breakdown', access, wrap(async (req, res) => {
  need(req.body.title, 'Title required');
  res.json({ subtasks: await ai.breakdownTask(req.body.title, req.body.description) });
}));
r.post('/boards/:boardId/ai/summary', access, wrap(async (req, res) => {
  const [cols, tasks] = await Promise.all([Column.find({ board_id: req.params.boardId }).sort({ position: 1 }), Task.find({ board_id: req.params.boardId })]);
  const snapshot = cols.map((c) => ({ column: c.title, tasks: tasks.filter((t) => String(t.column_id) === c.id).map((t) => ({ title: t.title, priority: t.priority, due_date: t.due_date })) }));
  res.json({ summary: await ai.sprintSummary(snapshot) });
}));
export default r;
