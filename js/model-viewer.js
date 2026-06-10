class MinecraftModelViewer {
  constructor(containerId, jsonUrl, textureUrl, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.jsonUrl = jsonUrl;
    this.textureUrl = textureUrl;
    this.options = Object.assign({
      controls: true,
      autoRotateSpeed: 2.0,
      scale: 12,
      yOffset: -2
    }, options);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.modelGroup = null;

    this.init();
  }

  async init() {
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 300;

    this.scene = new THREE.Scene();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight1.position.set(10, 20, 15);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-10, -10, -10);
    this.scene.add(dirLight2);

    const aspect = width / height;
    const frustumSize = 24;
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    this.camera.position.set(20, 16.33, 20);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    if (this.options.controls && typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.enableZoom = true;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = this.options.autoRotateSpeed;
    }

    try {
      const response = await fetch(this.jsonUrl);
      const modelJson = await response.json();

      const textureLoader = new THREE.TextureLoader();
      const loadedTexturesMap = {};

      if (modelJson.textures) {
        for (const [key, texPath] of Object.entries(modelJson.textures)) {
          const texFile = texPath.split('/').pop() + '.png';
          const fullPath = 'assets/' + texFile;

          try {
            const tex = await new Promise((resolve, reject) => {
              textureLoader.load(fullPath, resolve, undefined, reject);
            });
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            loadedTexturesMap['#' + key] = tex;
          } catch (e) {
            console.warn(`Could not load texture ${fullPath}, using fallback.`);
          }
        }
      }

      let fallbackTexture = null;
      if (this.textureUrl) {
        try {
          fallbackTexture = await new Promise((resolve, reject) => {
            textureLoader.load(this.textureUrl, resolve, undefined, reject);
          });
          fallbackTexture.magFilter = THREE.NearestFilter;
          fallbackTexture.minFilter = THREE.NearestFilter;
          fallbackTexture.wrapS = THREE.RepeatWrapping;
          fallbackTexture.wrapT = THREE.RepeatWrapping;
        } catch (e) {}
      }

      this.buildModel(modelJson, loadedTexturesMap, fallbackTexture);
      this.animate();
    } catch (err) {
      console.error("Failed to load or parse Minecraft Model: ", err);
    }

    window.addEventListener('resize', () => this.onWindowResize());
  }

  buildModel(modelJson, loadedTexturesMap, fallbackTexture) {
    this.modelGroup = new THREE.Group();
    const scaleFactor = 1 / 16;
    
    modelJson.elements.forEach(element => {
      const from = element.from;
      const to = element.to;
      
      const sizeX = to[0] - from[0];
      const sizeY = to[1] - from[1];
      const sizeZ = to[2] - from[2];
      
      const boxGeo = new THREE.BoxGeometry(sizeX * scaleFactor, sizeY * scaleFactor, sizeZ * scaleFactor);
      
      const faceKeys = ['east', 'west', 'up', 'down', 'south', 'north'];
      const materials = [];

      faceKeys.forEach(faceKey => {
        const faceData = element.faces[faceKey];
        if (faceData) {
          const activeTex = loadedTexturesMap[faceData.texture] || fallbackTexture;
          if (activeTex) {
            const faceTex = activeTex.clone();
            faceTex.needsUpdate = true;
            
            const uv = faceData.uv;
            
            const u1 = uv[0] / 16;
            const v1 = uv[1] / 16;
            const u2 = uv[2] / 16;
            const v2 = uv[3] / 16;
            
            faceTex.repeat.set(u2 - u1, v2 - v1);
            faceTex.offset.set(u1, 1 - v2);
            
            materials.push(new THREE.MeshStandardMaterial({
              map: faceTex,
              transparent: true,
              roughness: 0.8,
              metalness: 0.1,
              side: THREE.DoubleSide
            }));
          } else {
            materials.push(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
          }
        } else {
          materials.push(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
        }
      });

      const mesh = new THREE.Mesh(boxGeo, materials);
      
      const centerX = (from[0] + sizeX / 2) - 8;
      const centerY = (from[1] + sizeY / 2) - 8;
      const centerZ = (from[2] + sizeZ / 2) - 8;

      if (element.rotation) {
        const rot = element.rotation;
        const pivotGroup = new THREE.Group();
        
        const px = rot.origin[0] - 8;
        const py = rot.origin[1] - 8;
        const pz = rot.origin[2] - 8;
        
        pivotGroup.position.set(px * scaleFactor, py * scaleFactor, pz * scaleFactor);
        
        mesh.position.set(
          (centerX - px) * scaleFactor,
          (centerY - py) * scaleFactor,
          (centerZ - pz) * scaleFactor
        );
        
        pivotGroup.add(mesh);
        
        const rad = (rot.angle * Math.PI) / 180;
        if (rot.axis === 'x') pivotGroup.rotation.x = rad;
        if (rot.axis === 'y') pivotGroup.rotation.y = rad;
        if (rot.axis === 'z') pivotGroup.rotation.z = rad;
        
        this.modelGroup.add(pivotGroup);
      } else {
        mesh.position.set(centerX * scaleFactor, centerY * scaleFactor, centerZ * scaleFactor);
        this.modelGroup.add(mesh);
      }
    });

    this.modelGroup.scale.set(this.options.scale, this.options.scale, this.options.scale);
    this.modelGroup.position.y = this.options.yOffset;
    this.scene.add(this.modelGroup);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.controls) {
      this.controls.update();
    } else if (this.modelGroup) {
      this.modelGroup.rotation.y += 0.015;
      this.modelGroup.rotation.x = Math.sin(Date.now() * 0.001) * 0.15;
    }

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;
    const frustumSize = 24;

    this.camera.left = (frustumSize * aspect) / -2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = frustumSize / -2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

window.initMinecraftViewer = function(containerId, jsonUrl, textureUrl, options) {
  return new MinecraftModelViewer(containerId, jsonUrl, textureUrl, options);
};
