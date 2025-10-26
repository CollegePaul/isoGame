import test1RoomData from "../../../data/rooms/test1Room.json";
import { createRoomBuilder } from "../../../data/roomLoader.js";

const roomBuilders = new Map();
let defaultRoomId = null;

function registerRoom(roomData) {
  if (!roomData?.name) {
    throw new Error("Room data missing name property.");
  }
  roomBuilders.set(roomData.name, createRoomBuilder(roomData));
  if (!defaultRoomId) {
    defaultRoomId = roomData.name;
  }
}

function registerRooms(container) {
  if (!container) {
    return;
  }

  if (Array.isArray(container.rooms)) {
    container.rooms.forEach((room) => registerRoom(room));
    return;
  }

  registerRoom(container);
}

registerRooms(test1RoomData);

export function getRoomBuilder(name) {
  return roomBuilders.get(name);
}

export function listAvailableRooms() {
  return Array.from(roomBuilders.keys());
}

export function getDefaultRoomId() {
  return defaultRoomId;
}
