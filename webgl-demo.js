import { initBuffers } from "./init-buffers.js";
import { drawScene } from "./draw-scene.js";

let cube = {
  position: [-0.0, 0.0, -6.0],
  velocity: [0.0, 0.0, 0.0],
  target_velocity: [0.0, 0.0, 0.0],
  max_velocity: [10.0, 15.0, 1.0],
  acceleration: [75.0, 250.0, 1.0],
  deceleration: [100.0, 75.0, 1.0],
  grounded: true,
  jumping: false
};
let rotation = 0.0;
let deltaTime = 0;

let left_key_binding = 37;
let right_key_binding = 39;
let up_key_binding = 38;
let down_key_binding = 40;

let pressed_keys = [];

main();

//
// start here
//
function main() {
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
  attribute vec4 aVertexPosition;
  attribute vec3 aVertexNormal;
  attribute vec2 aTextureCoord;

  uniform mat4 uNormalMatrix;
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;

  varying highp vec2 vTextureCoord;
  varying highp vec3 vLighting;

  void main(void) {
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
      vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
      vertexNormal: gl.getAttribLocation(shaderProgram, "aVertexNormal"),
      textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(
        shaderProgram,
        "uProjectionMatrix"
      ),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
      normalMatrix: gl.getUniformLocation(shaderProgram, "uNormalMatrix"),
      uSampler: gl.getUniformLocation(shaderProgram, "uSampler"),
    },
  };

  // Here's where we call the routine that builds all the
  // objects we'll be drawing.
  const buffers = initBuffers(gl);

  // Load texture
  const texture = loadTexture(gl, "cubetexture.png");
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
  scene.push(cube);

  // Draw the scene repeatedly
  function render(now) {
    now *= 0.001; // convert to seconds
    deltaTime = now - then;
    then = now;

    updateScene(cube, scene, pressed_keys, deltaTime);
    drawScene(gl, programInfo, buffers, texture, scene);

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

//
// Initialize a texture and load an image.
// When the image finished loading copy it into the texture.
//
function loadTexture(gl, url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Because images have to be downloaded over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
  gl.texImage2D(
    gl.TEXTURE_2D,
    level,
    internalFormat,
    width,
    height,
    border,
    srcFormat,
    srcType,
    pixel
  );

  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      level,
      internalFormat,
      srcFormat,
      srcType,
      image
    );

    // WebGL1 has different requirements for power of 2 images
    // vs non power of 2 images so check if the image is a
    // power of 2 in both dimensions.
    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
      // Yes, it's a power of 2. Generate mips.
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      // No, it's not a power of 2. Turn off mips and set
      // wrapping to clamp to edge
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  };
  image.src = url;

  return texture;
}

function isPowerOf2(value) {
  return (value & (value - 1)) === 0;
}

function rotateCube(cube) {
  cube.rotationMatrix = mat4.create();
  mat4.rotate(
    cube.rotationMatrix, // destination matrix
    cube.rotationMatrix, // matrix to rotate
    rotation, // amount to rotate in radians
    [0, 0, 1]
  ); // axis to rotate around (Z)
  mat4.rotate(
    cube.rotationMatrix, // destination matrix
    cube.rotationMatrix, // matrix to rotate
    rotation * 0.7, // amount to rotate in radians
    [0, 1, 0]
  ); // axis to rotate around (Y)
  mat4.rotate(
    cube.rotationMatrix, // destination matrix
    cube.rotationMatrix, // matrix to rotate
    rotation * 0.3, // amount to rotate in radians
    [1, 0, 0]
  ); // axis to rotate around (X)
  rotation += deltaTime;
}

function updatePlayer(cube, pressed_keys, elapsed) {
  if (pressed_keys[left_key_binding]) {
    if (cube.grounded) {
      cube.target_velocity[0] = -cube.max_velocity[0];
      cube.velocity[0] = Math.max(cube.velocity[0] - (cube.acceleration[0] * elapsed), -cube.max_velocity[0]);
      cube.velocity[0] += Math.sign(cube.velocity[0]) * (cube.deceleration[0] * elapsed);
    }
  }
  if (pressed_keys[right_key_binding]) {
    if (cube.grounded) {
      cube.target_velocity[0] = cube.max_velocity[0];
      cube.velocity[0] = Math.min(cube.velocity[0] + (cube.acceleration[0] * elapsed), cube.max_velocity[0]);
      cube.velocity[0] += Math.sign(cube.velocity[0]) * (cube.deceleration[0] * elapsed);
    }
  }
  if (pressed_keys[up_key_binding]) {
    if (cube.grounded) {
      cube.jumping = true;
      cube.grounded = false;
    }
    if (cube.jumping) {
      cube.velocity[1] += (cube.acceleration[1] * elapsed);
      if (cube.velocity[1] >= cube.max_velocity[1]) {
        cube.velocity[1] = cube.max_velocity[1];
        cube.jumping = false;
      }
    }
  } else {
    cube.jumping = false;
  }
  if (pressed_keys[down_key_binding]) {
    cube.position[1] -= 1;
  }
}

function updatePhysics(scene, elapsed) {
  for (var cube of scene) {
    if (cube.grounded) {
      cube.velocity[0] = Math.sign(cube.velocity[0]) * Math.max(Math.abs(cube.velocity[0]) - (cube.deceleration[0] * elapsed), 0);
    }
  
    if (!cube.grounded) {
      cube.velocity[1] -= (cube.deceleration[1] * elapsed);
    }
  
    cube.position[0] += (elapsed * cube.velocity[0])
    cube.position[1] += (elapsed * cube.velocity[1])
  
    if (cube.position[1] <= 0) {
      cube.position[1] = 0;
      cube.velocity[1] = 0;
      cube.grounded = true;
    }

    console.log(cube.position);
  }
}

function updateScene(player, scene, pressed_keys, elapsed) {
  rotateCube(player);

  updatePlayer(player, pressed_keys, elapsed);
  updatePhysics(scene, elapsed);
}
