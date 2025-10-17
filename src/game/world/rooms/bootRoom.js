import roomData from "../../../data/rooms/bootRoom.json";
import { createRoomBuilder } from "../../../data/roomLoader.js";

export const buildBootRoom = createRoomBuilder(roomData);
