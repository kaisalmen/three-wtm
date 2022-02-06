
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

import { WorkerTaskManager } from '/src/loaders/workerTaskManager/WorkerTaskManager.js';
import {
    DataTransport,
    GeometryTransport,
    MeshTransport,
    MaterialsTransport,
    ObjectUtils,
    DeUglify
} from '/src/loaders/utils/TransportUtils.js';
import { MaterialUtils } from '/src/loaders/utils/MaterialUtils.js';
import { MaterialStore } from '/src/loaders/utils/MaterialStore.js';
import { OBJLoaderWorker } from '/examples/worker/tmOBJLoader.js';

/**
 * The aim of this example is to show two possible ways how to use the {@link WorkerTaskManager}:
 * - Worker defined inline
 * - Wrapper around OBJLoader, so it can be executed as worker
 *
 * The workers perform the same loading operation over and over again. This is not what you want to do
 * in a real-world loading scenario, but it is very helpful to demonstrate that workers executed in
 * parallel to main utilizes the CPU.
 */
class WorkerTaskManagerExample {

    constructor(elementToBindTo) {

        this.renderer = null;
        this.canvas = elementToBindTo;
        this.aspectRatio = 1;

        this.scene = null;
        this.cameraDefaults = {
            posCamera: new THREE.Vector3(1000.0, 1000.0, 1000.0),
            posCameraTarget: new THREE.Vector3(0, 0, 0),
            near: 0.1,
            far: 10000,
            fov: 45
        };
        this.camera = null;
        this.cameraTarget = this.cameraDefaults.posCameraTarget;
        this.controls = null;

        this.objectsUsed = new Map();

        this.workerTaskManager = new WorkerTaskManager(8).setVerbose(true);
        this.tasksToUse = [];
        this.materialStore = new MaterialStore(true);

    }

    initGL() {

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            autoClear: true
        });
        this.renderer.setClearColor(0x050505);

        this.scene = new THREE.Scene();

        this.recalcAspectRatio();
        this.camera = new THREE.PerspectiveCamera(this.cameraDefaults.fov, this.aspectRatio, this.cameraDefaults.near, this.cameraDefaults.far);
        this.resetCamera();
        this.controls = new TrackballControls(this.camera, this.renderer.domElement);

        let ambientLight = new THREE.AmbientLight(0x404040);
        let directionalLight1 = new THREE.DirectionalLight(0xC0C090);
        let directionalLight2 = new THREE.DirectionalLight(0xC0C090);

        directionalLight1.position.set(- 100, - 50, 100);
        directionalLight2.position.set(100, 50, - 100);

        this.scene.add(directionalLight1);
        this.scene.add(directionalLight2);
        this.scene.add(ambientLight);

        let helper = new THREE.GridHelper(1000, 30, 0xFF4444, 0x404040);
        this.scene.add(helper);

    }

    /** Registers both workers as tasks at the {@link WorkerTaskManager} and initializes them.  */
    async initContent() {

        /** Simplest way to define a worker for {@link WorkerTaskManager} */
        class InlineWorker {

            static init(context, id, config) {

                context.storage = { whoami: config.id };
                context.postMessage({ cmd: "init", id: id });

            }

            static execute(context, id, config) {

                let bufferGeometry = new THREE.SphereBufferGeometry(40, 64, 64);
                bufferGeometry.name = 'InlineWorker' + config.id;
                let vertexArray = bufferGeometry.getAttribute('position').array;
                for (let i = 0; i < vertexArray.length; i++) vertexArray[i] = vertexArray[i] * Math.random() * 0.48;
                new MeshTransport('execComplete', config.id)
                    .setGeometry(bufferGeometry, 0)
                    .package(false)
                    .postMessage(context);

            }

            static buildStandardWorkerDependencies(threeJsLocation) {
                return [
                    { url: threeJsLocation },
                    { code: '\n\n' },
                    { code: DeUglify.buildThreeConst() },
                    { code: '\n\n' },
                    { code: DeUglify.buildUglifiedThreeMapping() },
                    { code: '\n\n' },
                    { code: ObjectUtils.serializeClass(DataTransport) },
                    { code: ObjectUtils.serializeClass(GeometryTransport) },
                    { code: ObjectUtils.serializeClass(MaterialUtils) },
                    { code: ObjectUtils.serializeClass(MaterialsTransport) },
                    { code: ObjectUtils.serializeClass(MeshTransport) },
                    { code: DeUglify.buildUglifiedThreeWtmMapping() },
                    { code: '\n\n' }
                ];

            }

        }

        let awaiting = [];
        let taskDescr = {
            name: 'InlineWorker',
            funcInit: InlineWorker.init,
            funcExec: InlineWorker.execute,
            dependencies: InlineWorker.buildStandardWorkerDependencies('/node_modules/three/build/three.min.js')
        };
        this.tasksToUse.push(taskDescr);
        this.workerTaskManager.registerTaskTypeStandard(taskDescr.name, taskDescr.funcInit, taskDescr.funcExec, null, false, taskDescr.dependencies);
        awaiting.push(this.workerTaskManager.initTaskType(taskDescr.name, { param1: 'param1value' }).catch(e => console.error(e)));

        const taskDescrObj = {
            name: 'OBJLoaderStandard',
            filenameObj: '../models/female02_vertex_colors.obj',
            funcInit: OBJLoaderWorker.init,
            funcExec: OBJLoaderWorker.execute,
            dependencies: OBJLoaderWorker.buildStandardWorkerDependencies('/node_modules/three/build/three.min.js', '/node_modules/three/examples/js/loaders/OBJLoader.js')
        };
        this.tasksToUse.push(taskDescrObj);
        this.workerTaskManager.registerTaskTypeStandard(taskDescrObj.name, taskDescrObj.funcInit, taskDescrObj.funcExec, null, false, taskDescrObj.dependencies);
        const loadObj = async function(filenameObj) {
            let fileLoader = new THREE.FileLoader();
            fileLoader.setResponseType('arraybuffer');
            return await fileLoader.loadAsync(filenameObj);
        }
        await loadObj(taskDescrObj.filenameObj)
            .then(buffer => {
                const mt = new MaterialsTransport()
                    .addBuffer('modelData', buffer)
                    .setMaterials(this.materialStore.getMaterials())
                    .cleanMaterials()
                    .package(false);
                awaiting.push(this.workerTaskManager.initTaskType(taskDescrObj.name, mt.getMain(), mt.getTransferables()).catch(e => console.error(e)));
            });
        return await Promise.all(awaiting);

    }

    /** Once all tasks are initialized a 100 tasks are enqueued for execution by WorkerTaskManager. */
    async executeWorkers() {

        if (this.tasksToUse.length === 0) throw "No Tasks have been selected. Aborting..."

        console.time('start');
        let globalCount = 0;
        let taskToUseIndex = 0;
        const executions = [];

        for (let i = 0; i < 1000; i++) {

            let taskDescr = this.tasksToUse[taskToUseIndex];
            const tb = new DataTransport('execute', globalCount).setParams({ modelName: taskDescr.name });
            let promise = this.workerTaskManager.enqueueForExecution(taskDescr.name, tb.getMain(),
                data => this._processMessage(data))
                .then(data => this._processMessage(data))
                .catch(e => console.error(e))
            executions.push(promise);

            globalCount++;
            taskToUseIndex++;
            if (taskToUseIndex === this.tasksToUse.length) taskToUseIndex = 0;

        }
        await Promise.all(executions).then(x => {

            console.timeEnd('start');
            this.workerTaskManager.dispose();

        });

    }

    /**
     * This method is invoked when {@link WorkerTaskManager} received a message from a worker.
     * @param {object} payload Message received from worker
     * @private
     */
    _processMessage(payload) {
        switch (payload.cmd) {

            case 'assetAvailable':
            case 'execComplete':
                if (payload.type === 'MeshTransport') {

                    const meshTransport = new MeshTransport().loadData(payload).reconstruct(false);

                    const materialsTransport = meshTransport.getMaterialsTransport();
                    let material = materialsTransport.processMaterialTransport(this.materialStore ? this.materialStore.getMaterials() : {}, true);
                    if (material === undefined || material === null) {

                        let randArray = new Uint8Array(3);
                        window.crypto.getRandomValues(randArray);
                        const color = new THREE.Color(randArray[0] / 255, randArray[1] / 255, randArray[2] / 255);
                        material = new THREE.MeshPhongMaterial({ color: color });

                    }
                    const mesh = new THREE.Mesh(meshTransport.getBufferGeometry(), material);
                    this._addMesh(mesh, meshTransport.getId());

                } else if (payload.type !== 'DataTransport') {

                    console.error('Provided payload.type was neither mesh nor assetAvailable: ' + payload.cmd);

                }
                break;

            default:
                console.error(payload.id + ': Received unknown command: ' + payload.cmd);
                break;

        }
    }

    /** Add mesh at random position, but keep sub-meshes of an object together, therefore we need */
    _addMesh(mesh, id) {

        let pos = this.objectsUsed.get(id);
        if (pos === undefined) {

            // sphere positions
            const baseFactor = 750;
            pos = new THREE.Vector3(baseFactor * Math.random(), baseFactor * Math.random(), baseFactor * Math.random());
            pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), 2 * Math.PI * Math.random());
            pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), 2 * Math.PI * Math.random());
            pos.applyAxisAngle(new THREE.Vector3(0, 0, 1), 2 * Math.PI * Math.random());
            this.objectsUsed.set(id, pos);

        }
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.name = id + '' + mesh.name;
        this.scene.add(mesh);

    }

    resizeDisplayGL() {

        this.controls.handleResize();
        this.recalcAspectRatio();
        this.renderer.setSize(this.canvas.offsetWidth, this.canvas.offsetHeight, false);
        this.updateCamera();

    }

    recalcAspectRatio() {

        this.aspectRatio = (this.canvas.offsetHeight === 0) ? 1 : this.canvas.offsetWidth / this.canvas.offsetHeight;

    }

    resetCamera() {

        this.camera.position.copy(this.cameraDefaults.posCamera);
        this.cameraTarget.copy(this.cameraDefaults.posCameraTarget);
        this.updateCamera();

    }

    updateCamera() {

        this.camera.aspect = this.aspectRatio;
        this.camera.lookAt(this.cameraTarget);
        this.camera.updateProjectionMatrix();

    }

    render() {

        if (!this.renderer.autoClear) this.renderer.clear();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);

    }

}

let app = new WorkerTaskManagerExample(document.getElementById('example'));

console.time('Init tasks');
app.initContent().then(x => {
    console.timeEnd('Init tasks');
    app.executeWorkers();
}).catch(x => alert(x));

let resizeWindow = function() {
    app.resizeDisplayGL();
};

let render = function() {
    requestAnimationFrame(render);
    app.render();
};

window.addEventListener('resize', resizeWindow, false);

console.log('Starting initialisation phase...');
app.initGL();
app.resizeDisplayGL();

render();
