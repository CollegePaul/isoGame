import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import { Player } from "./entities/player.js";
import { World } from "./world/world.js";

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
  }

  getPlayer() {
    return this.player;
  }

  syncPlayerMesh() {
    this.playerMesh.position.copy(this.player.position);
  }
}
