import roomData from "../../../data/rooms/testRoom.json";
import { createRoomBuilder } from "../../../data/roomLoader.js";

export const buildBootRoom = createRoomBuilder(roomData);
