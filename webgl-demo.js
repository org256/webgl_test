import { initBuffers } from "./init-buffers.js";
import { loadTexture } from "./init-textures.js";
import { drawScene } from "./draw-scene.js";
import { load_mdl, get_mdl_frame, get_mdl_texture } from "./quake-mdl.js";

let cube = {
  position: [-0.0, 0.0, -6.0],
  velocity: [0.0, 0.0, 0.0],
  target_velocity: [0.0, 0.0, 0.0],
  acceleration: [0.0, 0.0, 0.0],
  max_velocity: [10.0, 15.0, 1.0],
  max_acceleration: [75.0, 250.0, 1.0],
  max_deceleration: [100.0, 75.0, 1.0],
  grounded: true,
  jumping: false
};
let quake_thing = {
  position: [-0.0, 0.0, -190.0],
  velocity: [0.0, 0.0, 0.0],
  target_velocity: [0.0, 0.0, 0.0],
  acceleration: [0.0, 0.0, 0.0],
  max_velocity: [10.0, 15.0, 1.0],
  max_acceleration: [75.0, 250.0, 1.0],
  max_deceleration: [100.0, 75.0, 1.0],
  grounded: true,
  jumping: false
}
let rotation = 0.0;
let deltaTime = 0;
let quake_rotation = 0.0;
let quake_animation_time = 0.0;
let quake_animation_framerate = 10;

let left_key_binding = 37;
let right_key_binding = 39;
let up_key_binding = 38;
let down_key_binding = 40;

let pressed_keys = [];

let textureCache = [];

let new_quake_thing = "ogre.mdl";

main();

function list_pak_contents(filename) {
  fetch(filename).then(function(response){
    response.arrayBuffer().then(function(buffer){
      var view = new DataView(buffer);
      var offset = 0;
      function next(size) { offset += size; return offset - size; }
      function getInt32() { return view.getInt32(next(4), true); }
      function getFloat32() { return view.getFloat32(next(4), true); }
      function getInt16() { return view.getInt16(next(2), true); }
      function getUInt8Array(size) { offset += size; return new Uint8Array(buffer.slice(offset - size, offset)); }
      function getText(size) {
        let text = String.fromCharCode.apply(null, getUInt8Array(size));
        for (let i = 0; i < text.length; i++) {
          if (text[i] == '\0') {
            text = text.substring(0, i);
            break;
          }
        }
        return text;
      }
    
      let pak = {};
      pak.id = getText(4);
      pak.offset = getInt32();
      pak.size = getInt32();
      pak.files = [];

      offset = pak.offset;
      for (let i = 0; i < pak.size; i += 64) {
        let file = {};
        file.name = getText(56);
        file.offset = getInt32();
        file.size = getInt32();
        pak.files.push(file);
      }
      console.log(pak);
    });
  });
}

//
// start here
//
function main() {
//  list_pak_contents("quake/pak0.pak");
  
  const canvas = document.querySelector("#glcanvas");
  // Initialize the GL context
  const gl = canvas.getContext("webgl");

  // Only continue if WebGL is available and working
  if (gl === null) {
    alert(
      "Unable to initialize WebGL. Your browser or machine may not support it."
    );
    return;
  }

  // Set clear color to black, fully opaque
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  // Clear the color buffer with specified clear color
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Vertex shader program

  const vsSource = `
  attribute vec4 aVertexPosition1;
  attribute vec4 aVertexPosition2;
  attribute vec3 aVertexNormal1;
  attribute vec3 aVertexNormal2;
  attribute vec2 aTextureCoord;

  uniform float frame_blend_ratio;
  uniform mat4 uNormalMatrix;
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;

  varying highp vec2 vTextureCoord;
  varying highp vec3 vLighting;

  void main(void) {
    vec4 aVertexPosition = (aVertexPosition1 * (1.0 - frame_blend_ratio)) + (aVertexPosition2 * frame_blend_ratio);
    vec3 aVertexNormal = (aVertexNormal1 * (1.0 - frame_blend_ratio)) + (aVertexNormal2 * frame_blend_ratio);

    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vTextureCoord = aTextureCoord;

    // Apply lighting effect

    highp vec3 ambientLight = vec3(0.3, 0.3, 0.3);
    highp vec3 directionalLightColor = vec3(1, 1, 1);
    highp vec3 directionalVector = normalize(vec3(0.85, 0.8, 0.75));

    highp vec4 transformedNormal = uNormalMatrix * vec4(aVertexNormal, 1.0);

    highp float directional = max(dot(transformedNormal.xyz, directionalVector), 0.0);
    vLighting = ambientLight + (directionalLightColor * directional);
  }
`;

  // Fragment shader program

  const fsSource = `
  varying highp vec2 vTextureCoord;
  varying highp vec3 vLighting;

  uniform sampler2D uSampler;

  void main(void) {
    highp vec4 texelColor = texture2D(uSampler, vTextureCoord);

    gl_FragColor = vec4(texelColor.rgb * vLighting, texelColor.a);
  }
`;

  // Initialize a shader program; this is where all the lighting
  // for the vertices and so forth is established.
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  // Collect all the info needed to use the shader program.
  // Look up which attributes our shader program is using
  // for aVertexPosition, aVertexColor and also
  // look up uniform locations.
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition1: gl.getAttribLocation(shaderProgram, "aVertexPosition1"),
      vertexPosition2: gl.getAttribLocation(shaderProgram, "aVertexPosition2"),
      vertexNormal1: gl.getAttribLocation(shaderProgram, "aVertexNormal1"),
      vertexNormal2: gl.getAttribLocation(shaderProgram, "aVertexNormal2"),
      textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
    },
    uniformLocations: {
      frame_blend_ratio: gl.getUniformLocation(shaderProgram, "frame_blend_ratio"), 
      projectionMatrix: gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
      normalMatrix: gl.getUniformLocation(shaderProgram, "uNormalMatrix"),
      uSampler: gl.getUniformLocation(shaderProgram, "uSampler"),
    },
  };

  // Here's where we call the routine that builds all the
  // objects we'll be drawing.
  cube.buffers1 = null;
  fetch("cube.json").then(function(response){
    response.json().then(function(json){
      cube.buffers1 = initBuffers(gl, json);
      cube.buffers2 = cube.buffers1;
      // Load texture
      let texture = textureCache[json.textureImage];
      if (texture === undefined) {
        texture = loadTexture(gl, json.textureImage);
      }
      cube.texture = texture;
    })
  });

  // Flip image pixels into the bottom-to-top order that WebGL expects.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  window.addEventListener("keydown", (e) =>  {
    if (e.repeat) return;
    pressed_keys[e.which] = true;
  });
  
  window.addEventListener("keyup", (e) =>  {
    pressed_keys[e.which] = false;
  });
  
  let then = 0;

  let scene = [];
//  scene.push(cube);
  scene.push(quake_thing);

  // Draw the scene repeatedly
  function render(now) {
    now *= 0.001; // convert to seconds
    deltaTime = now - then;
    then = now;

    if (new_quake_thing != undefined) {
      quake_thing.buffers1 = null;
      quake_thing.buffers2 = null;
      quake_thing.frames = [];
      fetch("quake/progs/" + new_quake_thing).then(function(response){
        response.arrayBuffer().then(function(buffer){
          var mdl = load_mdl(buffer);
          quake_thing.textures = [];
          for (let i = 0; i < mdl.header.num_skins; i++) {
            quake_thing.textures[i] = get_mdl_texture(gl, mdl, i);
          }
          quake_thing.frames = [];
          for (let i = 0; i < mdl.header.num_frames; i++) {
            quake_thing.frames[i] = get_mdl_frame(gl, mdl, i);
          }
          quake_thing.buffers1 = quake_thing.frames[0];
          quake_thing.buffers2 = quake_thing.buffers1;
          quake_thing.texture = quake_thing.textures[0];
        });
      });
      new_quake_thing = undefined;
    }

    updateScene(cube, quake_thing, scene, pressed_keys, deltaTime);
    drawScene(gl, programInfo, scene);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert(
      `Unable to initialize the shader program: ${gl.getProgramInfoLog(
        shaderProgram
      )}`
    );
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object

  gl.shaderSource(shader, source);

  // Compile the shader program

  gl.compileShader(shader);

  // See if it compiled successfully

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(
      `An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function rotateCube(cube) {
  cube.rotationMatrix = mat4.create();
  mat4.rotate(cube.rotationMatrix, cube.rotationMatrix, rotation * 1.0, [0, 0, 1]);
  mat4.rotate(cube.rotationMatrix, cube.rotationMatrix, rotation * 0.7, [0, 1, 0]);
  mat4.rotate(cube.rotationMatrix, cube.rotationMatrix, rotation * 0.3, [1, 0, 0]);
  rotation += deltaTime;
}

function rotateQuakeThing(cube) {
  cube.rotationMatrix = mat4.create();
  mat4.rotate(cube.rotationMatrix, cube.rotationMatrix, Math.PI * 0.0, [0, 0, 1]);
  mat4.rotate(cube.rotationMatrix, cube.rotationMatrix, rotation * 1.0, [0, 1, 0]);
  mat4.rotate(cube.rotationMatrix, cube.rotationMatrix, Math.PI * -0.5, [1, 0, 0]);
  quake_rotation += deltaTime;

  if (quake_thing.frames != undefined) {
    let fractional_frame = quake_animation_time * quake_animation_framerate;
    let frame = Math.floor(fractional_frame);
    fractional_frame -= frame;
    if (frame >= quake_thing.frames.length) {
      frame = 0;
      quake_animation_time -= (quake_thing.frames.length / quake_animation_framerate);
    }
    let next_frame = frame + 1;
    if (next_frame == quake_thing.frames.length) {
      next_frame = 0;
    }
    quake_thing.buffers1 = quake_thing.frames[frame];
    quake_thing.buffers2 = quake_thing.frames[next_frame];
    quake_thing.frame_blend_ratio = fractional_frame;
    quake_animation_time += deltaTime;
  }
}

function updatePlayer(cube, pressed_keys, elapsed) {
  if (cube.grounded) {
    cube.target_velocity = [ 0.0, -Infinity, 0.0 ];
    cube.acceleration = [ 0.0, -cube.max_deceleration[1], 0.0 ];
    if (elapsed > 0.0) {
      cube.acceleration[0] = -Math.sign(cube.velocity[0]) * Math.min(cube.max_deceleration[0], Math.abs(cube.velocity[0]) / elapsed);
    }

    if (pressed_keys[left_key_binding]) {
      cube.target_velocity[0] = -cube.max_velocity[0];
      cube.acceleration[0] = -cube.max_acceleration[0];
    }
    if (pressed_keys[right_key_binding]) {
      cube.target_velocity[0] = cube.max_velocity[0];
      cube.acceleration[0] = cube.max_acceleration[0];
    }
    if (pressed_keys[down_key_binding]) {
      cube.acceleration[1] = -cube.max_acceleration[1];
    }
    if (pressed_keys[up_key_binding]) {
      cube.jumping = true;
      cube.grounded = false;
    }
  } else {
    cube.acceleration = [ 0.0, -cube.max_deceleration[1], 0.0 ];
  }
  if (!pressed_keys[up_key_binding]) {
    cube.jumping = false;
  }
  if (cube.jumping) {
    if (cube.velocity[1] >= cube.max_velocity[1]) {
      cube.jumping = false;
    }
    cube.target_velocity[1] = cube.max_velocity[1];
    cube.acceleration[1] = cube.max_acceleration[1];
  }
}

function updatePhysics(scene, elapsed) {
  for (var cube of scene) {
    for (let i = 0; i < 2; i++) {
      cube.velocity[i] = cube.velocity[i] + (cube.acceleration[i] * elapsed);

      let sign = Math.sign(cube.target_velocity[i]);
      if ((sign * cube.velocity[i]) > (sign * cube.target_velocity[i])) {
        cube.velocity[i] = cube.target_velocity[i];
      }
      cube.position[i] += (elapsed * cube.velocity[i])
    }
  }
}

function updateGrounded(scene) {
  for (var cube of scene) {
    if (cube.position[1] < 0.0) {
      cube.position[1] = 0;
      cube.velocity[1] = 0;
      cube.grounded = true;
    }
  }
}

function updateScene(player, quake_thing, scene, pressed_keys, elapsed) {
  rotateCube(player);
  rotateQuakeThing(quake_thing);

  updatePlayer(player, pressed_keys, elapsed);
  updatePhysics(scene, elapsed);
  updateGrounded(scene);
}

function changeQuakeThing(thing) {
  new_quake_thing = thing;
}

export { changeQuakeThing };
