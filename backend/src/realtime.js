import { Activity, User } from './models.js';
let io;
export const setIo = (i) => { io = i; };
export const emitToBoard = (boardId, event, payload) => io?.to(`board:${boardId}`).emit(event, payload);
export async function logActivity(boardId, userId, action, message, metadata = {}) {
  const a = await Activity.create({ board_id: boardId, user_id: userId, action, message, metadata });
  const u = userId ? await User.findById(userId) : null;
  const out = { ...a.toJSON(), user_name: u?.name, user_avatar: u?.avatar_url };
  emitToBoard(boardId, 'activity:new', out); emitToBoard(boardId, 'activity:created', out); return a;
}
