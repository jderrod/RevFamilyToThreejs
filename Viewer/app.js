import * as THREE from 'https://unpkg.com/three@0.150.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.150.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.150.0/examples/jsm/loaders/GLTFLoader.js';

class RevitFamilyViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.gltf = null;
        this.metadata = null;
        this.currentTypeIndex = 0;
        this.familyTypes = [];
        this.parameterSchema = [];
        
        this.init();
        this.setupEventListeners();
    }

    init() {
        const container = document.getElementById('canvas-container');
        
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);
        this.scene.fog = new THREE.Fog(0xf0f0f0, 100, 200);

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            45,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(5, 5, 5);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        // Controls setup
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.maxPolarAngle = Math.PI / 2;

        // Lighting setup
        this.setupLighting();

        // Grid helper
        const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0xcccccc);
        this.scene.add(gridHelper);

        // Axes helper
        const axesHelper = new THREE.AxesHelper(2);
        this.scene.add(axesHelper);

        // Start animation loop
        this.animate();

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Directional light (sun)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // Add a second directional light from opposite direction for better illumination
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
        directionalLight2.position.set(-5, 5, -5);
        this.scene.add(directionalLight2);
    }

    setupEventListeners() {
        // File input
        const fileInput = document.getElementById('file-input');
        fileInput.addEventListener('change', (e) => this.loadFile(e.target.files[0]));

        // Sidebar toggle
        const toggleButton = document.getElementById('toggle-sidebar');
        const sidebar = document.getElementById('sidebar');
        toggleButton.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });

        // Family type selector
        const typeSelect = document.getElementById('family-type-select');
        typeSelect.addEventListener('change', (e) => {
            this.currentTypeIndex = parseInt(e.target.value);
            this.showFamilyType(this.currentTypeIndex);
            this.updateParameterUI();
        });
    }

    loadFile(file) {
        if (!file) {
            console.log('No file selected');
            return;
        }

        console.log('Loading file:', file.name, 'Size:', file.size);
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('loading').style.display = 'block';
        document.getElementById('error').style.display = 'none';

        const loader = new GLTFLoader();
        const reader = new FileReader();

        reader.onload = (e) => {
            console.log('File read successfully, parsing GLB...');
            const arrayBuffer = e.target.result;
            
            loader.parse(arrayBuffer, '', 
                (gltf) => {
                    console.log('GLB parsed successfully:', gltf);
                    this.onModelLoaded(gltf, file.size);
                }, 
                (error) => {
                    console.error('GLB parse error:', error);
                    this.onLoadError(error);
                }
            );
        };

        reader.onerror = (e) => {
            console.error('File reader error:', e);
            this.onLoadError(e);
        };

        reader.readAsArrayBuffer(file);
    }

    onModelLoaded(gltf, fileSize) {
        try {
            console.log('Processing loaded model...');
            document.getElementById('loading').style.display = 'none';
            
            // Remove existing model
            if (this.model) {
                this.scene.remove(this.model);
            }

            // Add new model
            this.gltf = gltf;
            this.model = gltf.scene;
            
            console.log('Model scene:', this.model);
            console.log('Scene children:', this.model.children);
            
            this.scene.add(this.model);

            // Center and scale model
            this.centerAndScaleModel();

            // Extract metadata
            this.extractMetadata(gltf);

            // Update UI
            this.updateStats(fileSize);
            this.updateParameterUI();
            this.updateTypeSelector();

            // Show first type
            if (this.familyTypes.length > 0) {
                this.showFamilyType(0);
            }
            
            console.log('Model loaded successfully');
        } catch (error) {
            console.error('Error in onModelLoaded:', error);
            this.onLoadError(error);
        }
    }

    onLoadError(error) {
        document.getElementById('loading').style.display = 'none';
        const errorElement = document.getElementById('error');
        errorElement.textContent = `Failed to load model: ${error.message || error}`;
        errorElement.style.display = 'block';
        console.error('Load error:', error);
    }

    centerAndScaleModel() {
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Center the model
        this.model.position.x = -center.x;
        this.model.position.y = -center.y;
        this.model.position.z = -center.z;

        // Scale model to fit view
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 10 / maxDim;
        this.model.scale.multiplyScalar(scale);

        // Update camera position
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    extractMetadata(gltf) {
        // Extract Revit metadata from asset.extras
        console.log('GLTF asset:', gltf.asset);
        console.log('GLTF extras:', gltf.asset?.extras);
        
        if (gltf.asset && gltf.asset.extras) {
            let extras = gltf.asset.extras;
            
            // If extras is a string, parse it as JSON
            if (typeof extras === 'string') {
                try {
                    extras = JSON.parse(extras);
                    console.log('Parsed extras from string:', extras);
                } catch (e) {
                    console.error('Failed to parse extras JSON:', e);
                }
            }
            
            if (extras.rvt) {
                this.metadata = extras.rvt;
                this.parameterSchema = this.metadata.parameters || [];
                this.familyTypes = this.metadata.types || [];
                console.log('Extracted metadata:', this.metadata);
            } else {
                console.warn('No rvt property in extras');
                this.metadata = null;
                this.parameterSchema = [];
                this.familyTypes = [];
            }
        } else {
            console.warn('No extras found in GLB file');
            this.metadata = null;
            this.parameterSchema = [];
            this.familyTypes = [];
        }
    }

    updateStats(fileSize) {
        let vertexCount = 0;
        let triangleCount = 0;

        this.model.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const geometry = child.geometry;
                if (geometry.attributes.position) {
                    vertexCount += geometry.attributes.position.count;
                }
                if (geometry.index) {
                    triangleCount += geometry.index.count / 3;
                }
            }
        });

        document.getElementById('vertex-count').textContent = vertexCount.toLocaleString();
        document.getElementById('triangle-count').textContent = triangleCount.toLocaleString();
        document.getElementById('file-size').textContent = this.formatFileSize(fileSize);
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    updateTypeSelector() {
        const selectorDiv = document.getElementById('type-selector');
        const select = document.getElementById('family-type-select');
        
        if (this.familyTypes.length > 1) {
            selectorDiv.style.display = 'block';
            select.innerHTML = '';
            
            this.familyTypes.forEach((type, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = type.name;
                select.appendChild(option);
            });
        } else {
            selectorDiv.style.display = 'none';
        }
    }

    showFamilyType(index) {
        // With the current export, all types share the same geometry
        // We just update the parameter values when switching types
        // Keep all geometry visible
        this.model.traverse((child) => {
            if (child.isMesh || child.isGroup) {
                child.visible = true;
            }
        });
        
        // Update the current type index
        this.currentTypeIndex = index;
        
        // Find the node with the matching name if it exists
        const typeName = this.familyTypes[index]?.name;
        if (typeName) {
            this.model.traverse((child) => {
                if (child.name === typeName) {
                    // This is the node for the selected type
                    child.visible = true;
                } else if (this.familyTypes.some(t => t.name === child.name)) {
                    // This is a node for a different type
                    child.visible = false;
                }
            });
        }
    }

    updateParameterUI() {
        const container = document.getElementById('parameters-container');
        container.innerHTML = '';

        if (!this.parameterSchema || this.parameterSchema.length === 0) {
            container.innerHTML = '<p style="color: #888;">No parameters found</p>';
            return;
        }

        const currentType = this.familyTypes[this.currentTypeIndex];
        if (!currentType) return;

        // Group parameters by type
        const instanceParams = this.parameterSchema.filter(p => p.isInstance);
        const typeParams = this.parameterSchema.filter(p => !p.isInstance);

        // Create UI for instance parameters
        if (instanceParams.length > 0) {
            this.createParameterGroup('Instance Parameters', instanceParams, currentType.values, container);
        }

        // Create UI for type parameters
        if (typeParams.length > 0) {
            this.createParameterGroup('Type Parameters', typeParams, currentType.values, container);
        }
    }

    createParameterGroup(title, parameters, values, container) {
        const group = document.createElement('div');
        group.className = 'parameter-group';
        
        const heading = document.createElement('h3');
        heading.textContent = title;
        group.appendChild(heading);

        parameters.forEach(param => {
            const paramDiv = document.createElement('div');
            paramDiv.className = 'parameter';

            const label = document.createElement('label');
            label.textContent = param.name;
            if (param.isReporting) {
                label.textContent += ' (Reporting)';
            }
            paramDiv.appendChild(label);

            const value = values[param.name];
            const input = this.createParameterInput(param, value);
            if (input) {
                paramDiv.appendChild(input);
            }

            if (param.formula) {
                const info = document.createElement('div');
                info.className = 'parameter-info';
                info.textContent = `Formula: ${param.formula}`;
                paramDiv.appendChild(info);
            }

            group.appendChild(paramDiv);
        });

        container.appendChild(group);
    }

    createParameterInput(param, value) {
        let input;

        switch (param.storageType) {
            case 'Double':
                input = document.createElement('input');
                input.type = 'number';
                input.value = value || 0;
                input.step = '0.01';
                if (param.isReporting) {
                    input.disabled = true;
                }
                
                // Add unit label if it's a length parameter
                if (param.dataType && param.dataType.includes('Length')) {
                    const wrapper = document.createElement('div');
                    wrapper.style.display = 'flex';
                    wrapper.style.alignItems = 'center';
                    wrapper.appendChild(input);
                    const unit = document.createElement('span');
                    unit.style.marginLeft = '0.5rem';
                    unit.textContent = 'm';
                    wrapper.appendChild(unit);
                    return wrapper;
                }
                break;

            case 'Integer':
                // Check if it's a Yes/No parameter
                if (param.dataType && param.dataType.includes('YesNo')) {
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = value === 1;
                    if (param.isReporting) {
                        input.disabled = true;
                    }
                } else {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.value = value || 0;
                    input.step = '1';
                    if (param.isReporting) {
                        input.disabled = true;
                    }
                }
                break;

            case 'String':
                input = document.createElement('input');
                input.type = 'text';
                input.value = value || '';
                if (param.isReporting) {
                    input.disabled = true;
                }
                break;

            case 'ElementId':
                input = document.createElement('input');
                input.type = 'text';
                input.value = value || -1;
                input.disabled = true; // ElementIds are typically read-only
                break;

            default:
                input = document.createElement('input');
                input.type = 'text';
                input.value = value || '';
                input.disabled = true;
        }

        return input;
    }

    onWindowResize() {
        const container = document.getElementById('canvas-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize viewer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new RevitFamilyViewer();
});
