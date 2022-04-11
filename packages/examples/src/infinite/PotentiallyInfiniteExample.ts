'use strict';

import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
//import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

import { Controller, GUI } from 'lil-gui';
import {
    WorkerTypeDefinition,
    WorkerTaskManager,
    DataTransportPayload,
    MaterialStore,
    MeshTransportPayload,
    MeshTransportPayloadUtils,
    MaterialsTransportPayloadUtils,
    PayloadType
} from 'three-wtm';

export type CameraDefaults = {
    posCamera: THREE.Vector3;
    posCameraTarget: THREE.Vector3;
    near: number;
    far: number;
    fov: number;
};

type TaskDescription = {
    id: number;
    name: string
    use: boolean;
    module: boolean;
    blob: boolean;
    workerUrl: URL | string;
    workerCount: number;
    modelName?: string;
    filenameObj?: string;
    filenameMtl?: string;
    materialStore?: MaterialStore;
};

/**
 * The aim of this example is to show all possible ways how to use the {@link WorkerTaskManager}:
 * - Standard Workers with dependency loading
 * - Module Workers with and without additional dependencies
 * - It also allows to use OBJLoader in wrapper (tmOBJLoader.js with and without modules.
 *
 * Via dat.gui it is possible to control various parameters of the example:
 * - The quantity of workers created for each task (1-32, default: 4)
 * - The absolute overall count of task executions (10^3-10^7, default: 10^6)
 * - The maximum amount of task executions per loop (=number of promises returned, 1-10000, default: 1000)
 * - How many meshes shall be kept as otherwise the continuous loading will (100-10000, default: 750)
 *
 * The tasks perform the same loading operation over and over again.
 * This is not what you want to do in a real-world loading scenario,
 * but it is very helpful to demonstrate:
 * - A good CPU utilization can be achieved permanently if the selected amount of workers match the logical CPUs available
 * - No memory is leaked, by the workers
 * - It can be extended or altered to test new worker implementations
 */
class PotentiallyInfiniteExample {

    private renderer: THREE.WebGLRenderer;
    private canvas: HTMLElement;
    private scene: THREE.Scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera;
    private cameraTarget: THREE.Vector3;
    private cameraDefaults: CameraDefaults = {
        posCamera: new THREE.Vector3(1000.0, 1000.0, 1000.0),
        posCameraTarget: new THREE.Vector3(0, 0, 0),
        near: 0.1,
        far: 10000,
        fov: 45
    };
    private controls: TrackballControls;
    private workerTaskManager: WorkerTaskManager = new WorkerTaskManager();

    public taskDescriptions = new Map<string, TaskDescription>();
    private tasksToUse: TaskDescription[] = [];
    private executions: Array<Promise<unknown>> = [];
    private objectsUsed = new Map<number, { name: string, pos: THREE.Vector3 }>();
    private meshesAdded: string[] = [];
    private removeCount = 50;
    numberOfMeshesToKeep = 750;
    overallExecutionCount = 1000000;

    // overall executions: maxPerLoop * loopCount
    maxPerLoop = 1000;
    // number of Promises kept in one go
    private loopCount = this.overallExecutionCount / this.maxPerLoop;
    reset = false;

    // sphere positions
    private baseFactor = 750;
    private baseVectorX = new THREE.Vector3(1, 0, 0);
    private baseVectorY = new THREE.Vector3(0, 1, 0);
    private baseVectorZ = new THREE.Vector3(0, 0, 1);

    abort = false;

    private ui: GUIControls;

    constructor(elementToBindTo: HTMLElement | null) {
        if (elementToBindTo === null) {
            throw Error('Bad element HTML given as canvas.');
        }
        this.ui = new GUIControls(document.getElementById('dat'), this);

        this.canvas = elementToBindTo;
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setClearColor(0x050505);

        this.cameraTarget = this.cameraDefaults.posCameraTarget;
        this.camera = new THREE.PerspectiveCamera(this.cameraDefaults.fov, this.recalcAspectRatio(), this.cameraDefaults.near, this.cameraDefaults.far);
        this.resetCamera();

        this.controls = new TrackballControls(this.camera, this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0x404040);
        const directionalLight1 = new THREE.DirectionalLight(0xC0C090);
        const directionalLight2 = new THREE.DirectionalLight(0xC0C090);

        directionalLight1.position.set(- 100, - 50, 100);
        directionalLight2.position.set(100, 50, - 100);

        this.scene.add(directionalLight1);
        this.scene.add(directionalLight2);
        this.scene.add(ambientLight);

        const helper = new THREE.GridHelper(1000, 30, 0xFF4444, 0x404040);
        helper.name = 'grid';
        this.scene.add(helper);
    }

    recalcExecutionNumbers() {
        this.loopCount = this.overallExecutionCount / this.maxPerLoop;
    }

    resetAppContext() {
        this.workerTaskManager = new WorkerTaskManager();
        this.workerTaskManager.setVerbose(false);

        const simpleWorkerDefinition = `${SimpleBlobWorker.toString()}

        worker = new SimpleBlobWorker();
        self.onmessage = message => worker.comRouting(message);
        `;
        const simpleWorkerBlobURL = WorkerTypeDefinition.createWorkerBlob([simpleWorkerDefinition]);

        // configure all task that shall be usable on register to the WorkerTaskManager
        this.taskDescriptions.clear();
        this.taskDescriptions.set('simpleBlobWorker', {
            id: 0,
            name: 'simpleBlobWorker',
            use: true,
            module: true,
            blob: true,
            workerUrl: simpleWorkerBlobURL,
            workerCount: this.workerTaskManager.getDefaultMaxParallelExecutions()
        });
        this.taskDescriptions.set('infiniteWorkerInternalGeometry', {
            id: 1,
            name: 'infiniteWorkerInternalGeometry',
            use: true,
            module: true,
            blob: false,
            workerUrl: new URL('../worker/infiniteWorkerInternalGeometry', import.meta.url),
            workerCount: this.workerTaskManager.getDefaultMaxParallelExecutions()
        });
        this.taskDescriptions.set('infiniteWorkerExternalGeometry', {
            id: 2,
            name: 'infiniteWorkerExternalGeometry',
            use: true,
            module: true,
            blob: false,
            workerUrl: new URL('../worker/infiniteWorkerExternalGeometry', import.meta.url),
            workerCount: this.workerTaskManager.getDefaultMaxParallelExecutions()
        });
        this.taskDescriptions.set('tmOBJLoader2Module', {
            id: 3,
            name: 'tmOBJLoader2Module',
            modelName: 'female02',
            use: false,
            module: true,
            blob: false,
            workerUrl: new URL('wwobjloader2/OBJLoader2Worker', import.meta.url),
            workerCount: this.workerTaskManager.getDefaultMaxParallelExecutions(),
            filenameMtl: '../models/obj/main/female02/female02.mtl',
            filenameObj: '../models/obj/main/female02/female02.obj',
            materialStore: new MaterialStore(true)
        });
        this.taskDescriptions.set('tmOBJLoader2Standard', {
            id: 4,
            name: 'tmOBJLoader2Standard',
            modelName: 'male02',
            use: false,
            module: false,
            blob: false,
            workerUrl: new URL('wwobjloader2/OBJLoader2WorkerStandard', import.meta.url),
            workerCount: this.workerTaskManager.getDefaultMaxParallelExecutions(),
            filenameMtl: '../models/obj/main/male02/male02.mtl',
            filenameObj: '../models/obj/main/male02/male02.obj',
            materialStore: new MaterialStore(true),
        });

        this.tasksToUse = [];
        this.executions = [];
        this.objectsUsed = new Map();

        if (this.reset) {
            this.deleteMeshRange(this.meshesAdded.length);
            this.reset = false;
        }
        this.meshesAdded = [];
        this.removeCount = 50;
        this.numberOfMeshesToKeep = 750;

        this.overallExecutionCount = 1000000;

        // overall executions: maxPerLoop * loopCount
        this.maxPerLoop = 1000;
        // number of Promises kept in one go
        this.loopCount = this.overallExecutionCount / this.maxPerLoop;
        this.abort = false;

        // sphere positions
        this.baseFactor = 750;
        this.baseVectorX = new THREE.Vector3(1, 0, 0);
        this.baseVectorY = new THREE.Vector3(0, 1, 0);
        this.baseVectorZ = new THREE.Vector3(0, 0, 1);
    }

    resetUI() {
        this.ui.resetContent();
    }

    resizeDisplayGL() {
        this.controls.handleResize();
        this.renderer.setSize(this.canvas.offsetWidth, this.canvas.offsetHeight, false);
        this.updateCamera();
    }

    recalcAspectRatio() {
        return (this.canvas.offsetHeight === 0) ? 1 : this.canvas.offsetWidth / this.canvas.offsetHeight;
    }

    resetCamera() {
        this.camera.position.copy(this.cameraDefaults.posCamera);
        this.cameraTarget.copy(this.cameraDefaults.posCameraTarget);
        this.updateCamera();
    }

    updateCamera() {
        this.camera.aspect = this.recalcAspectRatio();
        this.camera.lookAt(this.cameraTarget);
        this.camera.updateProjectionMatrix();
    }

    render() {
        if (!this.renderer.autoClear) this.renderer.clear();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    async run() {
        console.time('All tasks have been initialized');
        app.initContent().then(() => {
            console.timeEnd('All tasks have been initialized');
            app.executeWorkers();
        }).catch(x => alert(x));
    }

    /**
     * Registers any selected task at the {@link WorkerTaskManager} and initializes them.
     * The initialization varies. Some need task only pass dummy params others need
     * to init and send buffers to the workers
     *
     * @return {Promise<any>}
     */
    async initContent() {
        const awaiting = [];
        this.tasksToUse = [];

        let taskDescr = this.taskDescriptions.get('simpleBlobWorker');
        if (taskDescr && taskDescr.use) {
            this.tasksToUse.push(taskDescr);
            this.workerTaskManager.registerTask(taskDescr.name, {
                module: taskDescr.module,
                blob: taskDescr.blob,
                url: taskDescr.workerUrl
            }, taskDescr.workerCount);
            const payload = new DataTransportPayload('init', taskDescr.id, taskDescr.name);
            awaiting.push(this.workerTaskManager.initTaskType(taskDescr.name, payload));
        }
        taskDescr = this.taskDescriptions.get('infiniteWorkerInternalGeometry');
        if (taskDescr && taskDescr.use) {
            this.tasksToUse.push(taskDescr);
            this.workerTaskManager.registerTask(taskDescr.name, {
                module: taskDescr.module,
                blob: taskDescr.blob,
                url: taskDescr.workerUrl
            }, taskDescr.workerCount);

            const payload = new DataTransportPayload('init', taskDescr.id, taskDescr.name);
            payload.params = {
                param1: 'param1value'
            };
            awaiting.push(this.workerTaskManager.initTaskType(taskDescr.name, payload));
        }
        taskDescr = this.taskDescriptions.get('infiniteWorkerExternalGeometry');
        if (taskDescr && taskDescr.use) {
            this.tasksToUse.push(taskDescr);
            this.workerTaskManager.registerTask(taskDescr.name, {
                module: taskDescr.module,
                blob: taskDescr.blob,
                url: taskDescr.workerUrl
            }, taskDescr.workerCount);

            const torus = new THREE.TorusBufferGeometry(25, 8, 16, 100);
            torus.name = 'torus';
            const payloadToSend = new MeshTransportPayload('init', taskDescr.id, taskDescr.name);
            MeshTransportPayloadUtils.setBufferGeometry(payloadToSend, torus, 0);
            const packed = MeshTransportPayloadUtils.packMeshTransportPayload(payloadToSend, false);
            awaiting.push(this.workerTaskManager.initTaskType(taskDescr.name, packed.payload, packed.transferables));
        }
        /*
            taskDescr = this.taskDescriptions.get( 'tmOBJLoader2Module' );
            if ( taskDescr.use ) {
                this.tasksToUse.push( taskDescr );
                this.workerTaskManager.registerTaskTypeModule( taskDescr.name, taskDescr.module );
                await this.loadObjMtl( taskDescr )
                    .then( buffer => {
                        const mt = new MaterialsTransport()
                            .addBuffer( 'modelData', buffer )
                            .setMaterials( taskDescr.materialStore.getMaterials() )
                            .cleanMaterials()
                            .package( false );
                        awaiting.push( this.workerTaskManager.initTaskType( taskDescr.name, mt.getMain(), mt.getTransferables() ).catch( e => console.error( e ) ) );
                    } );
            }
            taskDescr = this.taskDescriptions.get( 'tmOBJLoader2Standard' );
            if ( taskDescr.use ) {
                this.tasksToUse.push( taskDescr );
                this.workerTaskManager.registerTaskType( taskDescr.name, taskDescr.funcInit, taskDescr.funcExec, null, false, taskDescr.dependencies );
                await this.loadObjMtl( taskDescr )
                    .then( buffer => {
                        const mt = new MaterialsTransport()
                            .addBuffer( 'modelData', buffer )
                            .setMaterials( taskDescr.materialStore.getMaterials() )
                            .cleanMaterials()
                            .package( false );
                        awaiting.push( this.workerTaskManager.initTaskType( taskDescr.name, mt.getMain(), mt.getTransferables() ).catch( e => console.error( e ) ) );
                    } );
            }
        */
        if (awaiting.length > 0) {
            return await Promise.all(awaiting);
        }
        else {
            return new Promise((_resolve, reject) => { reject('No task type has been configured'); });
        }
    }

    /** Only once needed for OBJ/MTL initialization */
    /*
            private async loadObjMtl(taskDescr: TaskDescription) {
                const fileLoader = new THREE.FileLoader();
                fileLoader.setResponseType('arraybuffer');

                const loadMtl = new Promise<MTLLoader.MaterialCreator>(resolve => {
                    const mtlLoader = new MTLLoader();
                    mtlLoader.load(taskDescr?.filenameMtl as string, resolve);
                });
                await loadMtl.then((materialCreator: MTLLoader.MaterialCreator) => {
                    materialCreator.preload();
                    taskDescr?.materialStore?.addMaterials(materialCreator.materials as unknown as Map<string, THREE.Material>, false);

                    // TODO
                    fileLoader.loadAsync(taskDescr?.filenameObj as string);
                });
            }
    */

    /**
     * Once all tasks are initialized a number of tasks (maxPerLoop) are enqueued.
     * This is repeated a configured number of times (loopCount) or the abort flag is set.
     * @return {Promise<void>}
     */
    async executeWorkers() {
        if (this.tasksToUse.length === 0) {
            throw new Error('No Tasks have been selected. Aborting...');
        }

        console.time('start');
        let globalCount = 0;
        const taskSelector = this.createTaskSelector();

        for (let j = 0; j < this.loopCount && !this.abort; j++) {
            console.time('Completed ' + (this.maxPerLoop + j * this.maxPerLoop));

            for (let i = 0; i < this.maxPerLoop; i++) {
                const indexToUse = Math.floor(Math.random() * taskSelector.totalWorkers);
                const taskDescr = taskSelector.taskSelectorArray[indexToUse];

                const tb = new DataTransportPayload('execute', globalCount);
                tb.params = {
                    modelName: taskDescr.name
                };
                const promise = this.workerTaskManager.enqueueForExecution(taskDescr.name, tb,
                    data => this.processMessage(taskDescr, data),
                    data => this.processMessage(taskDescr, data));
                this.executions.push(promise);

                globalCount++;
            }
            await Promise.all(this.executions).then(() => {
                this.executions = [];
                console.timeEnd('Completed ' + (this.maxPerLoop + j * this.maxPerLoop));
            });
        }
        this.workerTaskManager.dispose();
        console.timeEnd('start');
    }

    private createTaskSelector() {
        let totalWorkers = 0;
        const taskSelectorArray = [];

        for (const task of this.tasksToUse) {
            const taskWorkerCount = task.workerCount;
            totalWorkers += taskWorkerCount;
            for (let i = 0; i < taskWorkerCount; i++) {
                taskSelectorArray.push(task);
            }
        }

        return {
            totalWorkers: totalWorkers,
            taskSelectorArray: taskSelectorArray
        };
    }

    /**
     * This method is invoked when {@link WorkerTaskManager} received a message from a worker.
     * @param {object} taskDescr
     * @param {object} payload Message received from worker
     * @private
     */
    private processMessage(taskDescr: TaskDescription, payload: PayloadType) {
        let material: THREE.Material | THREE.Material[] | undefined;
        let mTP: MeshTransportPayload;
        let mesh: THREE.Mesh;
        switch (payload.cmd) {
            case 'initComplete':
                console.log('Init Completed: ' + payload.id);
                break;

            case 'execComplete':
            case 'intermediate':
                switch (payload.type) {
                    case 'MeshTransportPayload':
                        mTP = MeshTransportPayloadUtils.unpackMeshTransportPayload(payload as MeshTransportPayload, false);
                        if (mTP.params?.color) {
                            const pColor = mTP.params?.color as { r: number, g: number, b: number };
                            const color = new THREE.Color(pColor.r, pColor.g, pColor.b);
                            material = new THREE.MeshPhongMaterial({ color: color });
                        }
                        else {
                            if (mTP.materialsTransportPayload) {
                                const storedMaterials = taskDescr.materialStore ? taskDescr.materialStore.getMaterials() : new Map();
                                material = MaterialsTransportPayloadUtils.processMaterialTransport(mTP.materialsTransportPayload, storedMaterials, true);
                                if (!material) {
                                    material = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
                                }
                            }
                            else {
                                const randArray = new Uint8Array(3);
                                window.crypto.getRandomValues(randArray);
                                const color = new THREE.Color();
                                color.r = randArray[0] / 255;
                                color.g = randArray[1] / 255;
                                color.b = randArray[2] / 255;
                                material = new THREE.MeshPhongMaterial({ color: color });
                            }
                        }
                        mesh = new THREE.Mesh(mTP.bufferGeometry as THREE.BufferGeometry, material);
                        this.addMesh(mesh, mTP.id);
                        break;

                    case 'DataTransportPayload':
                        if (payload.cmd === 'execComplete') {
                            // This is the end-point for the
                            //console.log(`DataTransport: name: ${payload.name} id: ${payload.id} cmd: ${payload.cmd} workerId: ${payload.workerId}`);
                        }
                        break;

                    default:
                        console.error('Provided payload.type did not match: ' + payload.cmd);
                        break;

                }
                this.cleanMeshes();
                break;

            default:
                console.error(payload.id + ': Received unknown command: ' + payload.cmd);
                break;
        }
    }

    /**
     * Add mesh at random position, but keep sub-meshes of an object together
     */
    private addMesh(mesh: THREE.Mesh, id: number) {
        const storedPos = this.objectsUsed.get(id);
        let pos;
        if (storedPos) {
            pos = storedPos.pos;
        }
        else {
            pos = new THREE.Vector3(this.baseFactor * Math.random(), this.baseFactor * Math.random(), this.baseFactor * Math.random());
            pos.applyAxisAngle(this.baseVectorX, 2 * Math.PI * Math.random());
            pos.applyAxisAngle(this.baseVectorY, 2 * Math.PI * Math.random());
            pos.applyAxisAngle(this.baseVectorZ, 2 * Math.PI * Math.random());
            this.objectsUsed.set(id, { name: mesh.name, pos: pos });
        }
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.name = id + '' + mesh.name;
        this.scene.add(mesh);
        this.meshesAdded.push(mesh.name);
    }

    /**
     * Ensures that only the configured amount of meshes stay in the scene
     */
    private cleanMeshes() {
        if (this.meshesAdded.length >= this.numberOfMeshesToKeep) {
            this.deleteMeshRange(this.removeCount);
        }
    }

    /**
     * Perform the actual deletion of meshes from the scene.
     * @param {number} deleteRange
     */
    private deleteMeshRange(deleteRange: number) {
        let toBeRemoved;
        let deleteCount = 0;
        let i = 0;
        while (deleteCount < deleteRange && i < this.meshesAdded.length) {
            const meshName = this.meshesAdded[i];
            toBeRemoved = this.scene.getObjectByName(meshName) as THREE.Mesh;
            if (toBeRemoved) {
                toBeRemoved.geometry.dispose();
                if (toBeRemoved.material instanceof THREE.Material) {
                    if (typeof toBeRemoved.material.dispose === 'function') {
                        toBeRemoved.material.dispose();
                    }
                }
                else if (toBeRemoved.material.length > 0) {
                    for (const mat of toBeRemoved.material) {
                        mat.dispose();
                    }
                }

                this.scene.remove(toBeRemoved);
                this.meshesAdded.splice(i, 1);
                deleteCount++;
            }
            else {
                i++;
                console.log('Unable to remove: ' + meshName);
            }
        }
    }
}

// Simplest way to define a worker, but can't be a module worker
class SimpleBlobWorker {

    init(payload: PayloadType) {
        payload.cmd = 'initComplete';
        self.postMessage(payload);
    }

    execute(payload: PayloadType) {
        payload.cmd = 'execComplete';
        payload.params = {
            hello: 'say hello'
        };

        // burn some time
        for (let i = 0; i < 25000000; i++) {
            i++;
        }
        self.postMessage(payload);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comRouting(message: MessageEvent<any>) {
        const payload = (message as MessageEvent).data as PayloadType;
        if (payload) {
            if (payload.cmd === 'init') {
                this.init(payload);
            }
            else if (payload.cmd === 'execute') {
                this.execute(payload);
            }
        }
    }

}

class GUIControls {

    static DEFAULT_WORKER_COUNT = 4;

    private app: PotentiallyInfiniteExample;
    private started = false;

    private controllers: Map<string, Controller> = new Map();

    simpleBlobWorker = true;
    simpleBlobWorkerCount = GUIControls.DEFAULT_WORKER_COUNT;
    infiniteWorkerInternalGeometry = true;
    infiniteWorkerInternalGeometryCount = GUIControls.DEFAULT_WORKER_COUNT;
    infiniteWorkerExternalGeometry = true;
    infiniteWorkerExternalGeometryCount = GUIControls.DEFAULT_WORKER_COUNT;
    tmOBJLoader2Module = true;
    tmOBJLoader2ModuleCount = GUIControls.DEFAULT_WORKER_COUNT;
    tmOBJLoader2Standard = true;
    tmOBJLoader2StandardCount = GUIControls.DEFAULT_WORKER_COUNT;
    overallExecutionCount = 0;
    numberOfMeshesToKeep = 0;
    maxPerLoop = 0;

    constructor(elementToBindTo: HTMLElement | null, app: PotentiallyInfiniteExample) {
        if (elementToBindTo === null) {
            throw Error('Bad element HTML given as UI root.');
        }

        const gui: GUI = new GUI({
            autoPlace: false,
            width: 400
        });
        elementToBindTo.appendChild(gui.domElement);

        this.app = app;

        const controllerSimpleBlobWorker = gui.add(this, 'simpleBlobWorker').name('Blob Worker Standard');
        const controllerSimpleBlobWorkerCount = gui.add(this, 'simpleBlobWorkerCount', 1, 32).step(1).name('Worker Count');
        this.controllers.set('simpleBlobWorker', controllerSimpleBlobWorker);
        this.controllers.set('simpleBlobWorkerCount', controllerSimpleBlobWorkerCount);
        controllerSimpleBlobWorker.onChange((value: boolean) => {
            this.app.taskDescriptions.get('simpleBlobWorker')!.use = value;
            this.flipElement(controllerSimpleBlobWorkerCount, value);
        });
        controllerSimpleBlobWorkerCount.onChange((value: number) => {
            this.app.taskDescriptions.get('simpleBlobWorker')!.workerCount = value;
        });

        const controllerInfiniteWorkerInternalGeometry = gui.add(this, 'infiniteWorkerInternalGeometry').name('Worker Module + three');
        const controllerInfiniteWorkerInternalGeometryCount = gui.add(this, 'infiniteWorkerInternalGeometryCount', 1, 32).step(1).name('Worker Count');
        this.controllers.set('infiniteWorkerInternalGeometry', controllerInfiniteWorkerInternalGeometry);
        this.controllers.set('infiniteWorkerInternalGeometryCount', controllerInfiniteWorkerInternalGeometryCount);
        controllerInfiniteWorkerInternalGeometry.onChange((value: boolean) => {
            this.app.taskDescriptions.get('infiniteWorkerInternalGeometry')!.use = value;
            this.flipElement(controllerInfiniteWorkerInternalGeometryCount, value);
        });
        controllerInfiniteWorkerInternalGeometryCount.onChange((value: number) => {
            this.app.taskDescriptions.get('infiniteWorkerInternalGeometry')!.workerCount = value;
        });

        const controllerInfiniteWorkerExternalGeometry = gui.add(this, 'infiniteWorkerExternalGeometry').name('Worker Module solo');
        const controllerInfiniteWorkerExternalGeometryCount = gui.add(this, 'infiniteWorkerExternalGeometryCount', 1, 32).step(1).name('Worker Count');
        this.controllers.set('infiniteWorkerExternalGeometry', controllerInfiniteWorkerExternalGeometry);
        this.controllers.set('infiniteWorkerExternalGeometryCount', controllerInfiniteWorkerExternalGeometryCount);
        controllerInfiniteWorkerExternalGeometry.onChange((value: boolean) => {
            this.app.taskDescriptions.get('infiniteWorkerExternalGeometry')!.use = value;
            this.flipElement(controllerInfiniteWorkerExternalGeometryCount, value);
        });
        controllerInfiniteWorkerExternalGeometryCount.onChange((value: number) => {
            this.app.taskDescriptions.get('infiniteWorkerExternalGeometry')!.workerCount = value;
        });

        const controllerTmOBJLoader2Module = gui.add(this, 'tmOBJLoader2Module').name('OBJLoader2Parser Module');
        const controllerTmOBJLoader2ModuleCount = gui.add(this, 'tmOBJLoader2ModuleCount', 1, 32).step(1).name('Worker Count');
        this.controllers.set('tmOBJLoader2Module', controllerTmOBJLoader2Module);
        this.controllers.set('tmOBJLoader2ModuleCount', controllerTmOBJLoader2ModuleCount);
        controllerTmOBJLoader2Module.onChange((value: boolean) => {
            this.app.taskDescriptions.get('tmOBJLoader2Module')!.use = value;
            this.flipElement(controllerTmOBJLoader2ModuleCount, value);
        });
        controllerTmOBJLoader2ModuleCount.onChange((value: number) => {
            this.app.taskDescriptions.get('tmOBJLoader2Module')!.workerCount = value;
        });

        const controllerTmOBJLoader2Standard = gui.add(this, 'tmOBJLoader2Standard').name('OBJLoader2Parser Standard');
        const controllerTmOBJLoader2StandardCount = gui.add(this, 'tmOBJLoader2StandardCount', 1, 32).step(1).name('Worker Count');
        this.controllers.set('tmOBJLoader2Standard', controllerTmOBJLoader2Standard);
        this.controllers.set('tmOBJLoader2StandardCount', controllerTmOBJLoader2StandardCount);
        controllerTmOBJLoader2Standard.onChange((value: boolean) => {
            this.app.taskDescriptions.get('tmOBJLoader2Standard')!.use = value;
            this.flipElement(controllerTmOBJLoader2StandardCount, value);
        });
        controllerTmOBJLoader2StandardCount.onChange((value: number) => {
            this.app.taskDescriptions.get('tmOBJLoader2Standard')!.workerCount = value;
        });

        const controllerOverallExecutionCount = gui.add(this, 'overallExecutionCount', 1000, 10000000).step(1000).name('Overall Execution Count');
        this.controllers.set('overallExecutionCount', controllerOverallExecutionCount);
        controllerOverallExecutionCount.onChange((value: number) => {
            this.app.overallExecutionCount = value;
            this.app.recalcExecutionNumbers();
        });

        const controllerMaxPerLoop = gui.add(this, 'maxPerLoop', 1, 10000).step(100).name('Loop executions');
        this.controllers.set('maxPerLoop', controllerMaxPerLoop);
        controllerMaxPerLoop.onChange((value: number) => {
            this.app.maxPerLoop = value;
            this.app.recalcExecutionNumbers();
        });

        const controllerNumberOfMeshesToKeep = gui.add(this, 'numberOfMeshesToKeep', 100, 10000).step(25).name('Keep N Meshes');
        this.controllers.set('numberOfMeshesToKeep', controllerNumberOfMeshesToKeep);
        controllerNumberOfMeshesToKeep.onChange((value: number) => {
            this.app.numberOfMeshesToKeep = value;
        });

        const controllerExecuteLoading = gui.add(this, 'executeLoading').name('Engage');
        controllerExecuteLoading.domElement.id = 'startButton';
        this.controllers.set('executeLoading', controllerExecuteLoading);

        const controllerStopExecution = gui.add(this, 'stopExecution').name('Stop');
        this.controllers.set('stopExecution', controllerStopExecution);

        const controllerResetExecution = gui.add(this, 'resetExecution').name('Reset');
        this.controllers.set('resetExecution', controllerResetExecution);
    }

    executeLoading() {
        this.started = true;
        for (const controller of this.controllers.values()) {
            this.flipElement(controller, false);
        }
        this.flipElement(this.controllers.get('stopExecution'), true);
        this.app.run();
    }

    stopExecution() {
        this.started = false;
        app.abort = true;
        this.flipElement(this.controllers.get('resetExecution'), true);
    }

    resetExecution() {
        app.reset = true;
        if (this.started) {
            this.stopExecution();
        }
        else {
            app.resetAppContext();
            app.resetUI();
        }
    }

    resetContent() {
        let taskDescr = this.app.taskDescriptions.get('simpleBlobWorker')!;
        this.simpleBlobWorker = taskDescr.use;
        this.simpleBlobWorkerCount = taskDescr.workerCount;
        this.resetSingleControl(this.controllers.get('simpleBlobWorker')!, taskDescr.use);
        this.resetSingleControl(this.controllers.get('simpleBlobWorkerCount')!, taskDescr.use);

        taskDescr = this.app.taskDescriptions.get('infiniteWorkerInternalGeometry')!;
        this.infiniteWorkerInternalGeometry = taskDescr.use;
        this.infiniteWorkerInternalGeometryCount = taskDescr.workerCount;
        this.resetSingleControl(this.controllers.get('infiniteWorkerInternalGeometry')!, taskDescr.use);
        this.resetSingleControl(this.controllers.get('infiniteWorkerExternalGeometryCount')!, taskDescr.use);

        taskDescr = this.app.taskDescriptions.get('infiniteWorkerExternalGeometry')!;
        this.infiniteWorkerExternalGeometry = taskDescr.use;
        this.infiniteWorkerExternalGeometryCount = taskDescr.workerCount;
        this.resetSingleControl(this.controllers.get('infiniteWorkerExternalGeometry')!, taskDescr.use);
        this.resetSingleControl(this.controllers.get('infiniteWorkerExternalGeometryCount')!, taskDescr.use);

        taskDescr = this.app.taskDescriptions.get('tmOBJLoader2Module')!;
        this.tmOBJLoader2Module = taskDescr.use;
        this.tmOBJLoader2ModuleCount = taskDescr.workerCount;
        this.resetSingleControl(this.controllers.get('tmOBJLoader2Module')!, taskDescr.use);
        this.resetSingleControl(this.controllers.get('tmOBJLoader2ModuleCount')!, taskDescr.use);

        taskDescr = this.app.taskDescriptions.get('tmOBJLoader2Standard')!;
        this.tmOBJLoader2Standard = taskDescr.use;
        this.tmOBJLoader2StandardCount = taskDescr.workerCount;
        this.resetSingleControl(this.controllers.get('tmOBJLoader2Standard')!, taskDescr.use);
        this.resetSingleControl(this.controllers.get('tmOBJLoader2StandardCount')!, taskDescr.use);

        this.overallExecutionCount = this.app.overallExecutionCount;
        this.resetSingleControl(this.controllers.get('overallExecutionCount')!, true);

        this.numberOfMeshesToKeep = this.app.numberOfMeshesToKeep;
        this.resetSingleControl(this.controllers.get('numberOfMeshesToKeep')!, true);

        this.maxPerLoop = this.app.maxPerLoop;
        this.resetSingleControl(this.controllers.get('maxPerLoop')!, true);

        this.resetSingleControl(this.controllers.get('executeLoading')!, true);
        this.resetSingleControl(this.controllers.get('stopExecution')!, true);
        this.resetSingleControl(this.controllers.get('resetExecution')!, true);
    }

    flipElement(controller: Controller | undefined, enable: boolean) {
        if (!controller) {
            throw Error('Control is not availble');
        }
        if (enable) {
            controller.domElement.removeEventListener('click', this.blockEvent, true);
            controller.domElement.style.pointerEvents = 'auto';
            controller.domElement.style.opacity = '1.0';
        }
        else {
            controller.domElement.addEventListener('click', this.blockEvent, true);
            controller.domElement.style.pointerEvents = 'none';
            controller.domElement.style.opacity = '0.1';
        }
    }

    blockEvent(event: Event) {
        event.stopPropagation();
    }

    resetSingleControl(controller: Controller, enable: boolean) {
        this.flipElement(controller, enable);
        controller.updateDisplay();
    }
}

const app = new PotentiallyInfiniteExample(document.getElementById('example'));
console.log('Starting initialisation phase...');
app.resetAppContext();
app.resetUI();

window.addEventListener('resize', () => app.resizeDisplayGL(), false);
app.resizeDisplayGL();

const requestRender = function() {
    requestAnimationFrame(requestRender);
    app.render();
};
requestRender();