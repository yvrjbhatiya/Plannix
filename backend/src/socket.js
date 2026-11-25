import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, Member } from './models.js';
import { setIo } from './realtime.js';
export function initSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_URL, credentials: true } });
  setIo(io);
  const presence = new Map(); // boardId -> Map(userId -> {user, sockets:Set})
  io.use(async (s, next) => {
    try {
      const p = jwt.verify(s.handshake.auth?.token, process.env.JWT_SECRET);
      const u = await User.findById(p.id); if (!u) throw 0;
      s.user = { id: u.id, name: u.name, avatar_url: u.avatar_url }; next();
    } catch { next(new Error('Unauthorized')); }
  });
  const list = (b) => [...(presence.get(b)?.values() || [])].map((e) => e.user);
  io.on('connection', (s) => {
    const joined = new Set();
    s.on('board:join', async (boardId) => {
      if (!mongoose.isValidObjectId(boardId) || !(await Member.exists({ board_id: boardId, user_id: s.user.id }))) return;
      s.join(`board:${boardId}`); joined.add(boardId);
      if (!presence.has(boardId)) presence.set(boardId, new Map());
      const m = presence.get(boardId), e = m.get(s.user.id);
      if (e) e.sockets.add(s.id); else { m.set(s.user.id, { user: s.user, sockets: new Set([s.id]) }); s.to(`board:${boardId}`).emit('presence:join', { user: s.user }); }
      s.emit('presence:sync', { users: list(boardId) });
    });
    const leave = (boardId) => {
      s.leave(`board:${boardId}`); joined.delete(boardId);
      const m = presence.get(boardId), e = m?.get(s.user.id); if (!e) return;
      e.sockets.delete(s.id);
      if (!e.sockets.size) { m.delete(s.user.id); io.to(`board:${boardId}`).emit('presence:leave', { user: s.user }); }
    };
    s.on('board:leave', leave);
    s.on('presence:cursor', ({ boardId, x, y }) => joined.has(boardId) && s.to(`board:${boardId}`).emit('presence:cursor', { userId: s.user.id, name: s.user.name, x, y }));
    s.on('disconnect', () => [...joined].forEach(leave));
  });
}
