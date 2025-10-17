## Game project

A build a small game that is similar to classic isometric games from the 80's. Eg Head over Heels. 
The game shows 1 screen at a time, and there are doorways connecting rooms. The game contains a level that is a 
series of connected rooms. The rooms could also be vertcial, so that a character my use a lift to access a room above
or fall into a room below.
Generally the room may have 4 exists.

## Mechanics
Player can move up,down, left, right in the isometric world with keys, and they can also jump with space. They can jump at least 1 full block.

Player can push some crates or certian objects, objects also fall, and have basic collision. Collisions should be done with simple boxes.

The player can collect 2 objects.

My game will have some puzzles such as collecting the correct object to interact with another block, eg a room may have a broken lift, and the screwdriver is needed to interact with the lift pannel, or a light needs a bulb, or less obivious or fun connections. This idea is based on games like pjamarama or Spellbound (Magic knight version)
They are faily simple and the mechanics will not include any physics (other than falling objects and pushing) and object are box shaped. interactions are basic and will either trigger or not.

### Graphics and technologies
The graphics will be 3d using three.js and it will use WebXR for viewing the game in VR.
The graphics are failry blocky and will consist of cubes, and half cubes for the most part. walls will be 1/8 the depth and floors will be 1/8 on the bottom. 
Hidden blocks could be used for detecting if the player is going through a door.
The charaters will be basic models and designed to be block and will have limited animation.
The camera will probably be perspective as othrographic would look wrong.
Lighting or lights should be used, the rooms will be fairly basic, and polygon count will be low.
The blocks will be textured with pixel art, so textures will be small and I will probably use 1 large texture atlas for the whole game (reducing draw calls)
Quite a few models (cubes) could be generated with code.

Live server,html, css, javascript,three.js, WebXR for VR

There will be an area at the bottom for score, objects or health. Items may be rendered sprite of the 3d objects, or just the 3d object itself.

## Design
Modular , seperating data, logic and rendering.
Some way to save progress 
- location of character
- location of all game obejcts

## Initial start

A floor, 8 x 8, a cube for the player, and a 1 static block to test collisions. (player cant move off the 8x8 grid)
This will then be updated with additional blocks and higher blocks to further test collisons.
The the pushable crate will be added, then upto 2 more crates
The a more complex level.


## Map editor

I would like to make a seperate map editor after the game works, to build the small levels.
This would have html pannel with the blocks on which can be selected, and then place with the mouse on the three.js canvas world (with grid snapping.) This would have to be 3d. This is lower priority.






