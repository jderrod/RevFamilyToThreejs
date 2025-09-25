import * as THREE from 'https://cdn.skypack.dev/three@0.150.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.150.0/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.150.0/examples/jsm/loaders/GLTFLoader';

class RevitFamilyViewerWithServer {
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
        this.serverUrl = 'http://localhost:8080';
        this.isServerConnected = false;
        this.parameterUpdateDebounce = null;
        
        this.init();
        this.setupEventListeners();
        this.checkServerConnection();
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

        // Add server status indicator
        this.addServerStatusIndicator();
    }

    addServerStatusIndicator() {
        const header = document.querySelector('.header');
        const statusDiv = document.createElement('div');
        statusDiv.id = 'server-status';
        statusDiv.style.cssText = `
            display: inline-block;
            margin-left: 2rem;
            padding: 0.25rem 0.75rem;
            background: #f56565;
            color: white;
            border-radius: 4px;
            font-size: 0.9rem;
        `;
        statusDiv.textContent = '● Server Disconnected';
        header.querySelector('.controls').appendChild(statusDiv);
    }

    async checkServerConnection() {
        try {
            const response = await fetch(`${this.serverUrl}/api/status`);
            if (response.ok) {
                this.isServerConnected = true;
                const statusDiv = document.getElementById('server-status');
                statusDiv.style.background = '#48bb78';
                statusDiv.textContent = '● Server Connected';
                
                // Add real-time update button if connected
                this.addRealTimeControls();
            }
        } catch (error) {
            this.isServerConnected = false;
            console.log('Server not available - running in offline mode');
        }
        
        // Check again in 5 seconds
        setTimeout(() => this.checkServerConnection(), 5000);
    }

    addRealTimeControls() {
        const container = document.getElementById('parameters-container');
        if (!container || document.getElementById('real-time-controls')) return;
        
        const controlsDiv = document.createElement('div');
        controlsDiv.id = 'real-time-controls';
        controlsDiv.style.cssText = `
            background: #e6fffa;
            border: 1px solid #48bb78;
            border-radius: 4px;
            padding: 1rem;
            margin-bottom: 1rem;
        `;
        
        controlsDiv.innerHTML = `
            <h3 style="margin-bottom: 0.5rem; color: #2c7a7b;">Live Update Mode</h3>
            <p style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
                Connected to Revit. Parameter changes will update the model in real-time.
            </p>
            <label style="display: flex; align-items: center;">
                <input type="checkbox" id="enable-live-update" checked>
                <span style="margin-left: 0.5rem;">Enable live updates</span>
            </label>
        `;
        
        container.insertBefore(controlsDiv, container.firstChild);
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

        // Add a second directional light
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
        if (!file) return;

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('loading').style.display = 'block';
        document.getElementById('error').style.display = 'none';

        const loader = new GLTFLoader();
        const reader = new FileReader();

        reader.onload = (e) => {
            const arrayBuffer = e.target.result;
            
            loader.parse(arrayBuffer, '', (gltf) => {
                this.onModelLoaded(gltf, file.size);
            }, (error) => {
                this.onLoadError(error);
            });
        };

        reader.readAsArrayBuffer(file);
    }

    async loadFromServer() {
        if (!this.isServerConnected) return;
        
        try {
            document.getElementById('loading').style.display = 'block';
            const response = await fetch(`${this.serverUrl}/api/export`);
            
            if (!response.ok) {
                throw new Error('Server export failed');
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const loader = new GLTFLoader();
            
            loader.parse(arrayBuffer, '', (gltf) => {
                this.onModelLoaded(gltf, arrayBuffer.byteLength);
            }, (error) => {
                this.onLoadError(error);
            });
        } catch (error) {
            this.onLoadError(error);
        }
    }

    onModelLoaded(gltf, fileSize) {
        document.getElementById('loading').style.display = 'none';
        
        // Remove existing model
        if (this.model) {
            this.scene.remove(this.model);
        }

        // Add new model
        this.gltf = gltf;
        this.model = gltf.scene;
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
        if (gltf.asset && gltf.asset.extras && gltf.asset.extras.rvt) {
            this.metadata = gltf.asset.extras.rvt;
            this.parameterSchema = this.metadata.parameters || [];
            this.familyTypes = this.metadata.types || [];
            console.log('Extracted metadata:', this.metadata);
        } else {
            console.warn('No Revit metadata found in GLB file');
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
        // Hide all nodes
        this.model.traverse((child) => {
            if (child.isMesh || child.isGroup) {
                child.visible = false;
            }
        });

        // Show only the selected type's node
        if (this.model.children[index]) {
            this.model.children[index].visible = true;
            this.model.children[index].traverse((child) => {
                child.visible = true;
            });
        }
    }

    updateParameterUI() {
        const container = document.getElementById('parameters-container');
        
        // Keep real-time controls if they exist
        const realTimeControls = document.getElementById('real-time-controls');
        container.innerHTML = '';
        if (realTimeControls) {
            container.appendChild(realTimeControls);
        }

        if (!this.parameterSchema || this.parameterSchema.length === 0) {
            const p = document.createElement('p');
            p.style.color = '#888';
            p.textContent = 'No parameters found';
            container.appendChild(p);
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
                
                // Add live update handler if server is connected
                if (this.isServerConnected && !param.isReporting) {
                    this.addLiveUpdateHandler(input, param);
                }
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
        let wrapper;

        switch (param.storageType) {
            case 'Double':
                input = document.createElement('input');
                input.type = 'number';
                input.value = value || 0;
                input.step = '0.01';
                input.dataset.paramName = param.name;
                input.dataset.storageType = param.storageType;
                if (param.isReporting) {
                    input.disabled = true;
                }
                
                // Add unit label if it's a length parameter
                if (param.dataType && param.dataType.includes('Length')) {
                    wrapper = document.createElement('div');
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
                    input.dataset.paramName = param.name;
                    input.dataset.storageType = param.storageType;
                    if (param.isReporting) {
                        input.disabled = true;
                    }
                } else {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.value = value || 0;
                    input.step = '1';
                    input.dataset.paramName = param.name;
                    input.dataset.storageType = param.storageType;
                    if (param.isReporting) {
                        input.disabled = true;
                    }
                }
                break;

            case 'String':
                input = document.createElement('input');
                input.type = 'text';
                input.value = value || '';
                input.dataset.paramName = param.name;
                input.dataset.storageType = param.storageType;
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

    addLiveUpdateHandler(input, param) {
        const eventType = input.type === 'checkbox' ? 'change' : 'input';
        
        input.addEventListener(eventType, (e) => {
            const liveUpdateEnabled = document.getElementById('enable-live-update');
            if (!liveUpdateEnabled || !liveUpdateEnabled.checked) return;
            
            // Debounce the update
            clearTimeout(this.parameterUpdateDebounce);
            this.parameterUpdateDebounce = setTimeout(() => {
                this.sendParameterUpdate();
            }, 500);
        });
    }

    async sendParameterUpdate() {
        if (!this.isServerConnected) return;
        
        // Collect all current parameter values
        const parameters = {};
        const inputs = document.querySelectorAll('[data-param-name]');
        
        inputs.forEach(input => {
            const paramName = input.dataset.paramName;
            const storageType = input.dataset.storageType;
            
            let value;
            if (input.type === 'checkbox') {
                value = input.checked ? 1 : 0;
            } else if (storageType === 'Double') {
                value = parseFloat(input.value) || 0;
            } else if (storageType === 'Integer') {
                value = parseInt(input.value) || 0;
            } else {
                value = input.value;
            }
            
            parameters[paramName] = value;
        });
        
        const currentType = this.familyTypes[this.currentTypeIndex];
        
        try {
            document.getElementById('loading').style.display = 'block';
            
            const response = await fetch(`${this.serverUrl}/api/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    parameters: parameters,
                    typeName: currentType.name
                })
            });
            
            if (!response.ok) {
                throw new Error('Update failed');
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const loader = new GLTFLoader();
            
            loader.parse(arrayBuffer, '', (gltf) => {
                // Update model without resetting the view
                const currentCameraPosition = this.camera.position.clone();
                const currentTarget = this.controls.target.clone();
                
                this.onModelLoaded(gltf, arrayBuffer.byteLength);
                
                // Restore camera position
                this.camera.position.copy(currentCameraPosition);
                this.controls.target.copy(currentTarget);
                this.controls.update();
            }, (error) => {
                this.onLoadError(error);
            });
        } catch (error) {
            document.getElementById('loading').style.display = 'none';
            console.error('Parameter update failed:', error);
        }
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
    new RevitFamilyViewerWithServer();
});
