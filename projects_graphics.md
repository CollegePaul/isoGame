## Graphics

The textures for each block will be 32x32

The game will have several components.
- 1x1 cubes
- 8x8x0.2 floor
- walls
- doors
- crates
- player
- enemies
- pickups/objects

All of which will use cuboids for collision. (the door may have to be made in 3 parts.)


To reduce draw calls I was thinking of a texture atlas, just 1 big texture to hold all of the block textures.

eg a floor could have repeted uv's and just use 1 32x32 tile

Would I need seperate cubes for each seperate block with seperate uvs,
or could 1 cube be mapped to the atlas?
This way there would not be many models or textures to load?