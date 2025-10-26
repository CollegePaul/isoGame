## Editor Wishlist

### Selections
When selecting a component floor, player, crate, door etc...
- Draw a outline around it to show it is selected 
- Be able to change texture after selection ✅

### Block height
At the moment blocks are placed on the floor, in the future blocks could possibly be
placed at any height (1 to 5)?

### Misc
New room button width to 60%
As well as grid size have wall height in the 'Grid' Panel. ✅
Do we need room export if we have project export?


### Wall rendering
- wall rendering to show repeated textures at tile interval, rather than just 1 texture stretched. ✅
- Only the west and north walls are visible ✅
- Both west and north walls such be drawn ✅
- the such be the same size as the grid eg 8x8 and not overlap the edge. ✅
- Wall height should be able to be changed ✅
- Ingame the player cant move off the grid, at any height

### Right menu
If an item is selected eg Block,
a sub list apears with blocks eg 1/2 block, 1 Block or 2 high block
Option for objects and lights (see below)


### Objects
- Option to place objects
- Object are in a contextual right menu
- objects are gtlf or obj, but use 1 the main altas.png (all uvs are mapped seperatly to this)
- all objects could be in 1 glb file - assets/models/objects.glb and each have a different name in the file.
- objects are all 1 cube (or 2 cubes high) and all collisons would just be a basic cube.


### lights
perhapse have option to place a light or 2?
could be a basic small cube - renders only in editor
In game its just a light.


## Refactor
The editor file is getting quite big, maybe refactor into some additional editor modules.

