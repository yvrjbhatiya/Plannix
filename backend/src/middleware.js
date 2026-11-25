import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, Member } from './models.js';
export class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
export const requireAuth = wrap(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new ApiError(401, 'Missing token');
  let p; try { p = jwt.verify(h.slice(7), process.env.JWT_SECRET); } catch { throw new ApiError(401, 'Invalid token'); }
  const u = await User.findById(p.id);
  if (!u) throw new ApiError(401, 'User not found');
  req.user = u.toJSON(); next();
});
export const requireBoardAccess = (roles) => wrap(async (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params.boardId)) throw new ApiError(404, 'Board not found');
  const m = await Member.findOne({ board_id: req.params.boardId, user_id: req.user.id });
  if (!m) throw new ApiError(403, 'No access to this board');
  if (roles && !roles.includes(m.role)) throw new ApiError(403, 'Insufficient role');
  req.role = m.role; next();
});
export const errorHandler = (err, _req, res, _next) => {
  if (err.name === 'CastError' || err.name === 'ValidationError') return res.status(400).json({ error: 'Invalid input' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
};
