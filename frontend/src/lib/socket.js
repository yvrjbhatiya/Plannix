import { io } from "socket.io-client";
import { getToken } from "./api";

const URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5050";

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(URL, {
      autoConnect: false,
      auth: {
        token: getToken(),
      },
      transports: ["websocket"],
      withCredentials: true,
    });
  }

  return socket;
};

export const connectSocket = () => {
  const s = getSocket();

  s.auth = {
    token: getToken(),
  };

  if (!s.connected) s.connect();

  return s;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
  }
};