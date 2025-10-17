import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import { Player } from "./entities/player.js";
import { World } from "./world/world.js";
import { logger } from "../utils/logger.js";

const PLAYER_GEOMETRY = new BoxGeometry(0.8, 1.6, 0.8);
const PLAYER_MATERIAL = new MeshStandardMaterial({ color: 0xffcc66 });

export class Game {
  constructor({ scene, input }) {
    this.world = new World({ scene });
    this.player = new Player({ input });
    this.entities = [this.player];

    this.playerMesh = new Mesh(PLAYER_GEOMETRY, PLAYER_MATERIAL);
    this.playerMesh.castShadow = true;
    scene.add(this.playerMesh);
    this.activeDoorId = null;
  }

  loadRoom(roomBuilder) {
    this.world.loadRoom(roomBuilder);
    this.player.setSpawn(this.world.spawnPoint);
    this.syncPlayerMesh();
  }

  update(delta) {
    this.entities.forEach((entity) => {
      if (typeof entity.update === "function") {
        entity.update(delta, this.world);
      }
    });
    this.syncPlayerMesh();
    this.checkDoorways();
  }

  getPlayer() {
    return this.player;
  }

  syncPlayerMesh() {
    this.playerMesh.position.copy(this.player.position);
  }

  checkDoorways() {
    const doorways = this.world.getDoorways();
    if (!doorways || doorways.length === 0) {
      return;
    }

    const playerBox = this.player.getBoundingBox();
    let activeDoor = null;
    for (const doorway of doorways) {
      if (doorway.box.intersectsBox(playerBox)) {
        activeDoor = doorway;
        break;
      }
    }

    if (activeDoor) {
      if (this.activeDoorId !== activeDoor.id) {
        this.activeDoorId = activeDoor.id;
        logger.info(
          `Door reached: ${activeDoor.id}`,
          activeDoor.target ? `→ target room "${activeDoor.target}"` : "(no target assigned)",
        );
      }
    } else if (this.activeDoorId) {
      this.activeDoorId = null;
    }
  }
}
