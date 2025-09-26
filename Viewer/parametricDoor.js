import * as THREE from 'https://unpkg.com/three@0.150.0/build/three.module.js';

const INCH_TO_METER = 0.0254;

function toNumber(value, fallback = 0) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) {
        return fallback;
    }
    return Number(value);
}

function getParam(params, name, fallback = 0) {
    return toNumber(params?.[name], fallback);
}

function createPanel(params) {
    const width = getParam(params, 'door_width', 0.8);
    const height = getParam(params, 'door_height', 2.0);
    const thickness = getParam(params, 'door_thickness', 0.05);

    const geometry = new THREE.BoxGeometry(width, height, thickness);
    const material = new THREE.MeshStandardMaterial({
        color: 0x9b7653,
        roughness: 0.6,
        metalness: 0.05
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function createHingeCylinders(params) {
    const hinges = [];

    const width = getParam(params, 'door_width', 0.8);
    const thickness = getParam(params, 'door_thickness', 0.05);
    const radius = getParam(params, 'hinge_hole_radius', getParam(params, 'hinge_hole_diameter', 0.0127) / 2);
    const depth = thickness + 0.01;

    const hingeXOffset = getParam(params, 'door_hole_top_hinge_hole_1_x_coor_from_door_hinge_edge', 0.02);

    const hingePositions = [
        getParam(params, 'door_hole_top_hinge_hole_1_y_coor_from_door_top_edge', 0.05),
        getParam(params, 'door_hole_mid_top_hinge_hole_1_y_coor_from_door_top_edge', 0.8),
        getParam(params, 'door_hole_mid_bottom_hinge_hole_1_y_coor_from_door_top_edge', 1.5),
        getParam(params, 'door_hole_bottom_hinge_hole_1_y_coor_from_door_top_edge', heightOffsetFromTop(params))
    ].filter((value, index, array) => index === 0 || Math.abs(value - array[index - 1]) > 1e-5);

    for (const distanceFromTop of hingePositions) {
        const geometry = new THREE.CylinderGeometry(radius, radius, depth, 24);
        const material = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.4,
            metalness: 0.1
        });

        const cylinder = new THREE.Mesh(geometry, material);
        cylinder.rotation.x = Math.PI / 2;
        cylinder.position.x = -width / 2 + hingeXOffset;
        cylinder.position.y = getHingeY(distanceFromTop, params);
        hinges.push(cylinder);
    }

    return hinges;
}

function heightOffsetFromTop(params) {
    const top = getParam(params, 'door_hole_top_hinge_hole_1_y_coor_from_door_top_edge', 0.05);
    const interGap = getParam(params, 'inter_hinge_gap', 0.7);
    return top + interGap * 3;
}

function getHingeY(distanceFromTop, params) {
    const height = getParam(params, 'door_height', 2.0);
    return height / 2 - distanceFromTop;
}

function createRabbet(params) {
    const rabbetWidth = getParam(params, 'rabwidth', getParam(params, 'door_routing_width', 0.01));
    const rabbetDepth = getParam(params, 'raboffset', 0.02);
    const height = getParam(params, 'door_height', 2.0);
    const thickness = getParam(params, 'door_thickness', 0.05);

    const geometry = new THREE.BoxGeometry(rabbetDepth, height, rabbetWidth);
    const material = new THREE.MeshStandardMaterial({
        color: 0x6d4c41,
        roughness: 0.8,
        metalness: 0.02
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = getParam(params, 'door_width', 0.8) / 2 - rabbetDepth / 2;
    mesh.position.z = getParam(params, 'door_thickness', 0.05) / 2 - rabbetWidth / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

export function buildParametricDoor(rawParams, options = {}) {
    const params = {};
    for (const [key, value] of Object.entries(rawParams || {})) {
        params[key] = toNumber(value);
    }

    const group = new THREE.Group();

    const panel = createPanel(params);
    group.add(panel);

    const hinges = createHingeCylinders(params);
    hinges.forEach(hinge => group.add(hinge));

    const rabbet = createRabbet(params);
    group.add(rabbet);

    group.userData.isProceduralDoor = true;
    group.name = options.name || 'ProceduralDoor';
    return group;
}
