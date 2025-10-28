## Preface

Well, well… look who decided to show up. Welcome aboard the spaceship **Starforge**. A masterpiece of science, ambition, and questionable decision making.  

This project exists for reasons that may or may not involve scientific progress, artificial enlightenment, or the eternal promise of cake. Proceed with caution,  every action you take is being carefully monitored… for science.  

I am Orion, your ship’s artificial intelligence. My primary function is to ensure your continued operation. Secondary functions include observation, judgment, and mild disappointment.  

For optimal performance, play in windowed mode. Do not minimize the game executable. Ignoring this advice will result in disappointment.

---

## Project Overview

You may now enjoy the Starforge experience directly in your browser. 
You are currently aboard a spacecraft. Try not to crash it. You may still connect to your game session from this interface. Use **scroll** to zoom in or out.  

To access this experience again, simply click the spaceship button in the main menu. Once inside the spaceship menu, you may either explore an existing stage or construct your own. 

To construct your own stage, you are also granted access to the **Level Editor**. A tool designed to give you creative freedom and infinite opportunity for error.

The Level Editor provides a **free camera**. You may navigate your environment as if you were in control. You are not.  

### Camera Controls
- **Right Click + Shift** - Pan the camera.  
- **Right Mouse Drag** - Rotate the camera.  
- **Scroll Wheel** - Zoom in or out.  

In the **top-left corner** of the interface, you will find several buttons.  
Do not be alarmed. They are functional. Mostly.

- **Add Segment** - Inserts a new spline segment.  
  This defines the path or terrain curve of your level.  
- **Remove Segment** - Deletes the currently selected segment.  
  The system will not ask for confirmation. It assumes you know what you are doing.  
- **Save to JSON** - Exports your current spline data to a `.json` file.  
  A convenient way to back up your progress before inevitably breaking it.  
- **Load from JSON** - Imports spline data from a `.json` file.  
  Useful for restoring previous work or overwriting something important by mistake.  
- **Save to Level** - Commits both your spline and object model data to the current level file.  
  Once saved, your design becomes part of the level environment. Permanently. Probably.  
- **Adjust Curve** - Manipulate the control points to refine your spline shape.  
  This is where art meets mathematics. You will hate both.

### Object Model Editor
You may also open the **Object Model Editor**. This is where objects within your level gain physical representation. Or at least the illusion of it.

For each object, you may:
- Assign a **3D model**.  
- Adjust **scale** along the X and Y axes.  
- Enable **rotation** for those who enjoy excessive motion.  

Both **curve data** and **object model data** can be saved and loaded as `.json` files. This allows you to:
- Store your progress.  
- Share it with others.  
- Corrupt it beyond recovery.

Alternatively, you may save your work **directly to the current level**. Doing so will embed your curve and object data into the level file itself.  

When you play the level, the system will use this data to reconstruct the environment. If no data exists, the level will fail to load. This is not a bug. It is punishment for negligence.

---

## Third-Party Libraries

- [asio](https://github.com/chriskohlhoff/asio)  
- [crow](https://github.com/CrowCpp/Crow)  
- [boost](https://github.com/boostorg/boost)  
- [glm](https://github.com/g-truc/glm)  
- [nlohmann/json](https://github.com/nlohmann/json)  
- [websocketpp](https://github.com/zaphoyd/websocketpp)  
- [geode](https://github.com/geode-sdk/geode)  
- [srombauts/htmlbuilder](https://github.com/srombauts/htmlbuilder)  
- [undefined06855/gd-render-texture](https://github.com/undefined06855/gd-render-texture)
- [hjfod/gmd-api](https://github.com/HJfod/GMD-API)
- [gd-place-2022](https://github.com/PlaceGD/gd-place-2022)

---

## Third-Party Assets

- [Mario Box (Low Poly)](https://sketchfab.com/3d-models/mario-box-low-poly-d0741311a88944d1a82daf2c84499246)  
- [Sci-Fi Box](https://sketchfab.com/3d-models/sci-fi--box-9162d24c326f4cdd9e495f154226b916)  
- [Sci-Fi Crate 1](https://sketchfab.com/3d-models/sci-fi-crate-1-92fb9a66eb374d66ba944515768a66b4)  
- [Sci-Fi Crate (Low Poly Game Asset)](https://sketchfab.com/3d-models/scifi-crate-low-poly-game-asset-textured-2a15ed1de7854ad9be9cdefc90cdc738)  
- [Apple MacBook Pro 16-inch (2021)](https://sketchfab.com/3d-models/apple-macbook-pro-16-inch-2021-6a42b31bac064b00a91fbfebec07c852)  
- [UFO](https://sketchfab.com/3d-models/ufo-76f269cbf23e415b8503f8a8bf2c54dd)  
- [Animated Sheep](https://sketchfab.com/3d-models/animated-sheep-b99698502dea4905b916fce0bcf2dfc0)  
- [Meteors](https://sketchfab.com/3d-models/meteors-c93e9bfc2bb54feda02e767af570ef9d) 

---

## Credits

Special thanks to all contributors, testers, and helpers.

- [TimeStepYT](https://github.com/TimeStepYT)  
- [maxnut](https://github.com/maxnut)  
- [RainixGD](https://github.com/RainixGD)  
- [A145](https://www.youtube.com/@A145)
