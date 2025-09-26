import * as THREE from 'https://unpkg.com/three@0.150.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.150.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.150.0/examples/jsm/loaders/GLTFLoader.js';
import { buildParametricDoor } from './parametricDoor.js';

class RevitFamilyViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.metadata = null;
        this.parameterSchema = [];
        this.parameterSchemaByName = new Map();
        this.familyTypes = [];
        this.parameterRelationships = [];
        this.relationshipsByParameter = new Map();
        this.dependencyMap = new Map();
        this.dependentsMap = new Map();
        this.parameterRowsByName = new Map();
        this.activeHighlightParameter = null;
        this.proceduralGroup = null;
        this.lastFileSize = 0;

        this.init();
        this.setupEventListeners();
    }

    init() {
        const container = document.getElementById('canvas-container');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);
        this.scene.fog = new THREE.Fog(0xf0f0f0, 50, 150);

        this.camera = new THREE.PerspectiveCamera(
            45,
            container.clientWidth / container.clientHeight,
            0.01,
            500
        );
        this.camera.position.set(3, 2, 4);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.maxPolarAngle = Math.PI / 2;

        this.setupLighting();
        this.setupHelpers();

        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();
    }

    setupLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(5, 10, 5);
        keyLight.castShadow = true;
        keyLight.shadow.camera.near = 0.1;
        keyLight.shadow.camera.far = 50;
        keyLight.shadow.camera.left = -10;
        keyLight.shadow.camera.right = 10;
        keyLight.shadow.camera.top = 10;
        keyLight.shadow.camera.bottom = -10;
        keyLight.shadow.mapSize.set(2048, 2048);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-6, 4, -4);
        this.scene.add(fillLight);
    }

    setupHelpers() {
        const grid = new THREE.GridHelper(20, 20, 0x999999, 0xdddddd);
        this.scene.add(grid);

        const axes = new THREE.AxesHelper(1);
        axes.position.set(0, 0.001, 0);
        this.scene.add(axes);
    }

    setupEventListeners() {
        const fileInput = document.getElementById('file-input');
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                this.loadFile(file);
            }
        });

        const toggleButton = document.getElementById('toggle-sidebar');
        const sidebar = document.getElementById('sidebar');
        toggleButton.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });

        const typeSelect = document.getElementById('family-type-select');
        typeSelect.addEventListener('change', (event) => {
            const nextIndex = parseInt(event.target.value, 10);
            if (!Number.isNaN(nextIndex)) {
                this.currentTypeIndex = nextIndex;
                this.showFamilyType(this.currentTypeIndex);
                this.updateParameterUI();
                this.buildProceduralDoorForType(this.currentTypeIndex);
            }
        });
    }

    loadFile(file) {
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('loading').style.display = 'block';
        document.getElementById('error').style.display = 'none';

        const reader = new FileReader();
        const loader = new GLTFLoader();

        reader.onload = (event) => {
            const arrayBuffer = event.target.result;
            loader.parse(
                arrayBuffer,
                '',
                (gltf) => {
                    this.onModelLoaded(gltf, file.size);
                },
                (error) => this.onLoadError(error)
            );
        };

        reader.onerror = (error) => this.onLoadError(error);
        reader.readAsArrayBuffer(file);
    }

    onModelLoaded(gltf, fileSize) {
        document.getElementById('loading').style.display = 'none';
        this.lastFileSize = fileSize;

        if (this.model) {
            this.scene.remove(this.model);
            this.disposeObject(this.model);
            this.model = null;
        }

        if (this.proceduralGroup) {
            this.scene.remove(this.proceduralGroup);
            this.disposeObject(this.proceduralGroup);
            this.proceduralGroup = null;
        }

        this.gltf = gltf;
        this.model = gltf.scene;
        if (this.model) {
            this.scene.add(this.model);
            this.model.visible = false;
        }

        this.extractMetadata(gltf);
        this.updateTypeSelector();
        this.updateParameterUI();

        if (this.familyTypes.length > 0) {
            this.currentTypeIndex = 0;
            this.buildProceduralDoorForType(this.currentTypeIndex);
        }

        this.updateStats();
    }

    onLoadError(error) {
        document.getElementById('loading').style.display = 'none';
        const message = error?.message || 'Failed to load GLB file';
        const errorElement = document.getElementById('error');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        console.error(error);
    }

    extractMetadata(gltf) {
        this.metadata = null;
        this.parameterSchema = [];
        this.parameterSchemaByName.clear();
        this.familyTypes = [];

        const extras = gltf?.asset?.extras;
        const rvtExtras = this.parseExtras(extras);

        if (rvtExtras && rvtExtras.rvt) {
            this.metadata = rvtExtras.rvt;

            this.parameterSchema = Array.isArray(this.metadata.parameters)
                ? this.metadata.parameters.map((param) => this.normalizeParameter(param)).filter(Boolean)
                : [];

            this.parameterSchemaByName = new Map(
                this.parameterSchema.map((param) => [param.name, param])
            );

            this.familyTypes = Array.isArray(this.metadata.types)
                ? this.metadata.types.map(this.normalizeFamilyType).filter(Boolean)
                : [];

            this.parameterRelationships = Array.isArray(this.metadata.relationships)
                ? this.metadata.relationships.map((relationship) => this.normalizeRelationship(relationship)).filter(Boolean)
                : [];

            this.relationshipsByParameter = new Map(
                this.parameterRelationships.map((relationship) => [relationship.parameterName, relationship])
            );

            this.buildRelationshipGraphs();
        }
    }

    parseExtras(extras) {
        if (!extras) {
            return null;
        }

        if (typeof extras === 'string') {
            try {
                return JSON.parse(extras);
            } catch (parseError) {
                console.warn('Could not parse extras JSON', parseError);
                return null;
            }
        }

        if (typeof extras === 'object') {
            return extras;
        }

        return null;
    }

    normalizeParameter(param) {
        if (!param) {
            return null;
        }

        if (param.normalized && param.name) {
            return param;
        }

        const name = param.name ?? param.Name ?? '';
        if (!name) {
            return null;
        }

        const formulaRaw = param.formula ?? param.Formula ?? null;

        const normalized = {
            name,
            isInstance: this.coerceBoolean(param.isInstance ?? param.IsInstance ?? false),
            isReporting: this.coerceBoolean(param.isReporting ?? param.IsReporting ?? false),
            isShared: this.coerceBoolean(param.isShared ?? param.IsShared ?? false),
            storageType: String(param.storageType ?? param.StorageType ?? '').trim(),
            dataType: String(param.dataType ?? param.DataType ?? '').trim(),
            formula: typeof formulaRaw === 'string' ? formulaRaw.trim() : null,
            guid: param.guid ?? param.Guid ?? null,
            normalized: true
        };

        if (normalized.formula === '') {
            normalized.formula = null;
        }

        return normalized;
    }

    normalizeRelationship(relationship) {
        if (!relationship) {
            return null;
        }

        const parameterName = relationship.parameterName ?? relationship.ParameterName ?? '';
        if (!parameterName) {
            return null;
        }

        const dependencies = Array.isArray(relationship.dependencies ?? relationship.Dependencies)
            ? (relationship.dependencies ?? relationship.Dependencies).map((value) => String(value)).filter(Boolean)
            : [];

        const targets = Array.isArray(relationship.targets ?? relationship.Targets)
            ? (relationship.targets ?? relationship.Targets).map((target) => ({
                  elementId: target.elementId ?? target.ElementId ?? null,
                  category: target.category ?? target.Category ?? null,
                  geometryType: target.geometryType ?? target.GeometryType ?? null,
                  referenceStableRepresentation: target.referenceStableRepresentation ?? target.ReferenceStableRepresentation ?? null
              }))
            : [];

        return {
            parameterName,
            formula: relationship.formula ?? relationship.Formula ?? null,
            isReporting: this.coerceBoolean(relationship.isReporting ?? relationship.IsReporting ?? false),
            dependencies,
            targets
        };
    }

    buildRelationshipGraphs() {
        this.dependencyMap = new Map();
        this.dependentsMap = new Map();

        this.parameterRelationships.forEach((relationship) => {
            this.dependencyMap.set(relationship.parameterName, relationship.dependencies);

            relationship.dependencies.forEach((dependencyName) => {
                if (!this.dependentsMap.has(dependencyName)) {
                    this.dependentsMap.set(dependencyName, []);
                }
                const dependents = this.dependentsMap.get(dependencyName);
                if (!dependents.includes(relationship.parameterName)) {
                    dependents.push(relationship.parameterName);
                }
            });
        });
    }

    coerceBoolean(value) {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        if (typeof value === 'string') {
            const lowered = value.trim().toLowerCase();
            if (['true', 't', 'yes', 'y', '1'].includes(lowered)) {
                return true;
            }
            if (['false', 'f', 'no', 'n', '0'].includes(lowered)) {
                return false;
            }
        }
        return Boolean(value);
    }

    isBooleanParameter(param) {
        if (!param) {
            return false;
        }
        const dataType = (param.dataType || '').toLowerCase();
        if (dataType.includes('bool') || dataType.includes('yesno')) {
            return true;
        }
        const name = (param.name || '').toLowerCase();
        return name.endsWith('_toggle') || name.startsWith('is_') || name.startsWith('has_');
    }

    normalizeFamilyType = (familyType) => {
        if (!familyType) {
            return { name: '', values: {} };
        }

        if (familyType.normalized) {
            return familyType;
        }

        const name = familyType.name ?? familyType.Name ?? '';
        const values = familyType.values ?? familyType.Values ?? {};

        const normalizedValues = {};
        Object.entries(values).forEach(([key, value]) => {
            if (value === undefined) {
                return;
            }
            const schema = this.parameterSchemaByName?.get(key);

            if (schema?.storageType === 'Double') {
                const numeric = typeof value === 'number' ? value : Number(value);
                normalizedValues[key] = Number.isFinite(numeric) ? numeric : 0;
            } else if (schema?.storageType === 'Integer') {
                if (this.isBooleanParameter(schema)) {
                    normalizedValues[key] = this.coerceBoolean(value) ? 1 : 0;
                } else {
                    const numeric = typeof value === 'number' ? value : parseInt(value, 10);
                    normalizedValues[key] = Number.isFinite(numeric) ? numeric : 0;
                }
            } else {
                normalizedValues[key] = value ?? '';
            }
        });

        return {
            name,
            values: normalizedValues,
            normalized: true
        };
    }

    updateStats(fileSize = this.lastFileSize) {
        let vertexCount = 0;
        let triangleCount = 0;

        const root = this.proceduralGroup || this.model;
        if (root) {
            root.traverse((child) => {
                if (child.isMesh && child.geometry) {
                    const geometry = child.geometry;
                    if (geometry.attributes?.position) {
                        vertexCount += geometry.attributes.position.count;
                    }
                    if (geometry.index) {
                        triangleCount += geometry.index.count / 3;
                    }
                }
            });
        }

        document.getElementById('vertex-count').textContent = vertexCount.toLocaleString();
        document.getElementById('triangle-count').textContent = triangleCount.toLocaleString();
        document.getElementById('file-size').textContent = this.formatFileSize(fileSize);
    }

    formatFileSize(bytes) {
        if (!bytes) return '-';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    updateTypeSelector() {
        const selectorWrapper = document.getElementById('type-selector');
        const select = document.getElementById('family-type-select');

        if (this.familyTypes.length > 1) {
            selectorWrapper.style.display = 'block';
            select.innerHTML = '';
            this.familyTypes.forEach((type, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = type.name || `Type ${index + 1}`;
                if (index === this.currentTypeIndex) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        } else {
            selectorWrapper.style.display = 'none';
            select.innerHTML = '';
        }
    }

    showFamilyType(index) {
        if (!this.model) {
            return;
        }

        this.model.traverse((child) => {
            child.visible = false;
        });

        const selectedType = this.familyTypes[index];
        if (selectedType) {
            const typeNode = this.model.getObjectByName(selectedType.name);
            if (typeNode) {
                typeNode.traverse((child) => {
                    child.visible = true;
                });
            }
        }
    }

    updateParameterUI() {
        const container = document.getElementById('parameters-container');
        container.innerHTML = '';

        if (this.parameterSchema.length === 0 || !this.familyTypes[this.currentTypeIndex]) {
            const emptyMessage = document.createElement('p');
            emptyMessage.style.color = '#888';
            emptyMessage.textContent = 'No parameters available in metadata.';
            container.appendChild(emptyMessage);
            return;
        }

        const typeValues = this.familyTypes[this.currentTypeIndex].values || {};
        const aggregatedTypeValues = this.getAggregatedTypeValues();

        const instanceParams = [];
        const typeParams = [];

        this.parameterRowsByName = new Map();

        this.parameterSchema.forEach((param) => {
            if (param.isInstance === true) {
                instanceParams.push(param);
            } else {
                typeParams.push(param);
            }
        });

        if (instanceParams.length > 0) {
            const instanceGroup = this.createParameterGroup('Instance Parameters', instanceParams, typeValues, aggregatedTypeValues);
            container.appendChild(instanceGroup);
        }

        if (typeParams.length > 0) {
            const typeGroup = this.createParameterGroup('Type Parameters', typeParams, typeValues, aggregatedTypeValues);
            container.appendChild(typeGroup);
        }
    }

    getAggregatedTypeValues() {
        if (!Array.isArray(this.familyTypes)) {
            return {};
        }

        const aggregated = {};
        this.familyTypes.forEach((familyType) => {
            Object.assign(aggregated, familyType.values || {});
        });
        return aggregated;
    }

    createParameterGroup(title, parameters, primaryValues, fallbackValues = {}) {
        const group = document.createElement('div');
        group.className = 'parameter-group';

        const heading = document.createElement('h3');
        heading.textContent = title;
        group.appendChild(heading);

        parameters.forEach((param) => {
            const row = document.createElement('div');
            row.className = 'parameter';
            row.dataset.parameterName = param.name;

            const label = document.createElement('label');
            label.textContent = param.name;
            if (param.isReporting) {
                label.textContent += ' (Reporting)';
            } else if (param.formula) {
                label.textContent += ' (Formula)';
            }
            row.appendChild(label);

            const primaryValue = primaryValues?.[param.name];
            const fallbackValue = fallbackValues?.[param.name];
            const resolvedValue = primaryValue !== undefined ? primaryValue : fallbackValue;
            const input = this.createParameterInput(param, resolvedValue);
            row.appendChild(input.wrapper || input.element);

            this.decorateParameterRow(row, param, input.element || input.wrapper);

            if (param.formula) {
                const formulaInfo = document.createElement('div');
                formulaInfo.className = 'parameter-info';
                formulaInfo.textContent = `Formula: ${param.formula}`;
                row.appendChild(formulaInfo);
            }

            group.appendChild(row);
        });

        return group;
    }

    decorateParameterRow(row, param, inputElement) {
        this.parameterRowsByName.set(param.name, row);

        const relationship = this.relationshipsByParameter.get(param.name);
        const dependents = this.dependentsMap.get(param.name) || [];

        if (relationship || dependents.length > 0) {
            const info = document.createElement('div');
            info.className = 'parameter-relationships';

            if (relationship && relationship.dependencies.length > 0) {
                const dependencyHeading = document.createElement('div');
                dependencyHeading.className = 'relationship-heading';
                dependencyHeading.textContent = 'Depends on:';
                info.appendChild(dependencyHeading);

                const dependencyList = document.createElement('ul');
                relationship.dependencies.forEach((dependencyName) => {
                    const item = document.createElement('li');
                    item.textContent = dependencyName;
                    dependencyList.appendChild(item);
                });
                info.appendChild(dependencyList);
            }

            if (dependents.length > 0) {
                const dependentsHeading = document.createElement('div');
                dependentsHeading.className = 'relationship-heading';
                dependentsHeading.textContent = 'Drives:';
                info.appendChild(dependentsHeading);

                const dependentsList = document.createElement('ul');
                dependents.forEach((dependentName) => {
                    const item = document.createElement('li');
                    item.textContent = dependentName;
                    dependentsList.appendChild(item);
                });
                info.appendChild(dependentsList);
            }

            if (relationship && relationship.targets.length > 0) {
                const targetsHeading = document.createElement('div');
                targetsHeading.className = 'relationship-heading';
                targetsHeading.textContent = 'Targets:';
                info.appendChild(targetsHeading);

                const targetsList = document.createElement('ul');
                relationship.targets.forEach((target) => {
                    const item = document.createElement('li');
                    const parts = [target.geometryType, target.category, target.elementId].filter(Boolean);
                    item.textContent = parts.join(' · ');
                    targetsList.appendChild(item);
                });
                info.appendChild(targetsList);
            }

            row.appendChild(info);
            row.addEventListener('mouseenter', () => this.applyRelationshipHighlight(param.name));
            row.addEventListener('mouseleave', () => this.clearRelationshipHighlight());
        }

        if (inputElement && inputElement.addEventListener) {
            inputElement.addEventListener('focus', () => this.applyRelationshipHighlight(param.name));
            inputElement.addEventListener('blur', () => this.clearRelationshipHighlight());
        }
    }

    applyRelationshipHighlight(parameterName) {
        if (this.activeHighlightParameter === parameterName) {
            return;
        }

        this.clearRelationshipHighlight();
        this.activeHighlightParameter = parameterName;

        const primaryRow = this.parameterRowsByName.get(parameterName);
        if (primaryRow) {
            primaryRow.classList.add('highlight-primary');
        }

        const dependencies = this.dependencyMap.get(parameterName) || [];
        dependencies.forEach((dependencyName) => {
            const dependencyRow = this.parameterRowsByName.get(dependencyName);
            if (dependencyRow) {
                dependencyRow.classList.add('highlight-dependency');
            }
        });

        const dependents = this.dependentsMap.get(parameterName) || [];
        dependents.forEach((dependentName) => {
            const dependentRow = this.parameterRowsByName.get(dependentName);
            if (dependentRow) {
                dependentRow.classList.add('highlight-dependent');
            }
        });
    }

    clearRelationshipHighlight() {
        if (!this.parameterRowsByName) {
            return;
        }

        this.parameterRowsByName.forEach((row) => {
            row.classList.remove('highlight-primary', 'highlight-dependency', 'highlight-dependent');
        });

        this.activeHighlightParameter = null;
    }

    createParameterInput(param, value) {
        const result = { element: null, wrapper: null };
        const disabled = Boolean(param.isReporting || param.formula);
        const storageType = param.storageType;

        if (storageType === 'Double') {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.001';
            const numeric = typeof value === 'number' ? value : Number(value) || 0;
            input.value = numeric;
            input.disabled = disabled;
            input.addEventListener('change', () => this.handleParameterChange(param, Number(input.value)));

            if (param.dataType && param.dataType.toLowerCase().includes('length')) {
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.appendChild(input);

                const unit = document.createElement('span');
                unit.style.marginLeft = '0.5rem';
                unit.textContent = 'm';
                wrapper.appendChild(unit);

                const secondary = document.createElement('span');
                secondary.style.marginLeft = '0.75rem';
                secondary.style.color = '#666';
                secondary.style.fontSize = '0.85rem';
                const feet = numeric / 0.3048;
                secondary.textContent = `(${feet.toFixed(3)} ft)`;
                wrapper.appendChild(secondary);

                result.element = input;
                result.wrapper = wrapper;
            } else {
                result.element = input;
            }
        } else if (storageType === 'Integer') {
            if (this.isBooleanParameter(param)) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                const checked = this.coerceBoolean(value);
                checkbox.checked = checked;
                checkbox.disabled = disabled;
                checkbox.addEventListener('change', () => this.handleParameterChange(param, checkbox.checked ? 1 : 0));
                result.element = checkbox;
            } else {
                const input = document.createElement('input');
                input.type = 'number';
                input.step = '1';
                input.value = typeof value === 'number' ? value : Number(value) || 0;
                input.disabled = disabled;
                input.addEventListener('change', () => this.handleParameterChange(param, parseInt(input.value, 10) || 0));
                result.element = input;
            }
        } else if (storageType === 'String') {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value ?? '';
            input.disabled = disabled;
            input.addEventListener('change', () => this.handleParameterChange(param, input.value));
            result.element = input;
        } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value ?? '';
            input.disabled = true;
            result.element = input;
        }

        if (!result.wrapper) {
            result.wrapper = result.element;
        }

        return result;
    }

    handleParameterChange(param, newValue) {
        const currentType = this.familyTypes[this.currentTypeIndex];
        if (!currentType) {
            return;
        }

        if (!currentType.values) {
            currentType.values = {};
        }

        currentType.values[param.name] = newValue;
        this.buildProceduralDoorForType(this.currentTypeIndex);
    }

    buildProceduralDoorForType(typeIndex) {
        if (!this.familyTypes[typeIndex]) {
            return;
        }

        const type = this.familyTypes[typeIndex];
        const rawValues = type.values || {};
        const normalized = this.normalizeValues(rawValues);

        if (this.proceduralGroup) {
            this.scene.remove(this.proceduralGroup);
            this.disposeObject(this.proceduralGroup);
            this.proceduralGroup = null;
        }

        this.proceduralGroup = buildParametricDoor(normalized, { name: `${type.name || 'FamilyType'}_procedural` });
        this.scene.add(this.proceduralGroup);
        this.frameObject(this.proceduralGroup);
        this.updateStats();
    }

    normalizeValues(values) {
        const normalized = {};
        Object.entries(values).forEach(([name, value]) => {
            if (value === null || value === undefined) {
                return;
            }

            const schema = this.parameterSchemaByName.get(name);
            if (!schema) {
                normalized[name] = value;
                return;
            }

            if (schema.storageType === 'Double') {
                const numeric = typeof value === 'number' ? value : Number(value);
                normalized[name] = Number.isFinite(numeric) ? numeric : 0;
            } else if (schema.storageType === 'Integer') {
                const numeric = typeof value === 'number' ? value : Number(value);
                normalized[name] = Number.isFinite(numeric) ? numeric : 0;
            } else {
                normalized[name] = value;
            }
        });
        return normalized;
    }

    disposeObject(object3d) {
        object3d.traverse((child) => {
            if (child.isMesh) {
                child.geometry?.dispose?.();
                if (Array.isArray(child.material)) {
                    child.material.forEach((mat) => mat?.dispose?.());
                } else {
                    child.material?.dispose?.();
                }
            }
        });
    }

    frameObject(object3d) {
        if (!object3d) {
            return;
        }

        const box = new THREE.Box3().setFromObject(object3d);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (maxDim === 0) {
            return;
        }

        const distance = maxDim * 1.8 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
        const direction = new THREE.Vector3(1, 1, 1).normalize();
        const newPosition = center.clone().add(direction.multiplyScalar(distance));

        this.camera.position.copy(newPosition);
        this.controls.target.copy(center);
        this.controls.update();
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

document.addEventListener('DOMContentLoaded', () => {
    new RevitFamilyViewer();
});
