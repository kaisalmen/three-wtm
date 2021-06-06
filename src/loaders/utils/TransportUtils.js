/**
 * Development repository: https://github.com/kaisalmen/three-wtm
 */

import {
	BufferGeometry,
	BufferAttribute,
	Box3,
	Sphere,
	Texture,
	MaterialLoader
} from 'three';
import { MaterialUtils } from './MaterialUtils.js';

class DeUglify {

	static buildThreeConst () {
		return 'const EventDispatcher = THREE.EventDispatcher;\n' +
			'const BufferGeometry = THREE.BufferGeometry;\n' +
			'const BufferAttribute = THREE.BufferAttribute;\n' +
			'const Box3 = THREE.Box3;\n' +
			'const Sphere = THREE.Sphere;\n' +
			'const Texture = THREE.Texture;\n' +
			'const MaterialLoader = THREE.MaterialLoader;\n';
	}

	static buildUglifiedThreeMapping () {
		function _BufferGeometry() { return BufferGeometry; }
		function _BufferAttribute () { return BufferAttribute; }
		function _Box3 () { return Box3; }
		function _Sphere () { return Sphere; }
		function _Texture () { return Texture; }
		function _MaterialLoader () { return MaterialLoader; }

		return DeUglify.buildUglifiedNameAssignment( _BufferGeometry, 'BufferGeometry', /_BufferGeometry/, false ) +
			DeUglify.buildUglifiedNameAssignment( _BufferAttribute, 'BufferAttribute', /_BufferAttribute/, false ) +
			DeUglify.buildUglifiedNameAssignment( _Box3, 'Box3', /_Box3/, false ) +
			DeUglify.buildUglifiedNameAssignment( _Sphere, 'Sphere', /_Sphere/, false ) +
			DeUglify.buildUglifiedNameAssignment( _Texture, 'Texture', /_Texture/, false ) +
			DeUglify.buildUglifiedNameAssignment( _MaterialLoader, 'MaterialLoader', /_MaterialLoader/, false );
	}

	static buildUglifiedThreeWtmMapping () {
		function _DataTransport () { return DataTransport; }
		function _GeometryTransport () { return GeometryTransport; }
		function _MeshTransport () { return MeshTransport; }
		function _MaterialsTransport () { return MaterialsTransport; }
		function _MaterialUtils () { return MaterialUtils; }

		return DeUglify.buildUglifiedNameAssignment( _DataTransport, 'DataTransport', /_DataTransport/, true ) +
			DeUglify.buildUglifiedNameAssignment( _GeometryTransport, 'GeometryTransport', /_GeometryTransport/, true ) +
			DeUglify.buildUglifiedNameAssignment( _MeshTransport, 'MeshTransport', /_MeshTransport/, true ) +
			DeUglify.buildUglifiedNameAssignment( _MaterialsTransport, 'MaterialsTransport', /_MaterialsTransport/, true ) +
			DeUglify.buildUglifiedNameAssignment( _MaterialUtils, 'MaterialUtils', /_MaterialUtils/, true );
	}

	static buildUglifiedNameAssignment(func, name, methodPattern, invert) {
		let funcStr = func.toString();
		// remove the method name and any line breaks (rollup lib creation, non-uglify case
		funcStr = funcStr.replace(methodPattern, "").replace(/[\r\n]+/gm, "");
		// remove return and any semi-colons
		funcStr = funcStr.replace(/.*return/, "").replace(/\}/, "").replace(/;/gm, "");
		const retrieveNamed = funcStr.trim()
		// return non-empty string in uglified case (name!=retrieveNamed); e.g. "const BufferGeometry = e";
		// return empty string in case of non-uglified lib/src
		let output = "";
		if (retrieveNamed !== name) {
			const left = invert ? name : retrieveNamed;
			const right = invert ? retrieveNamed : name;
			output = "const " + left + " = " + right + ";\n";
		}
		return output;
	}
}



/**
 * Define a base structure that is used to ship data in between main and workers.
 */
class DataTransport {

	/**
	 * Creates a new {@link DataTransport}.
	 * @param {string} [cmd]
	 * @param {string} [id]
	 */
	constructor( cmd, id ) {

		this.main = {
			cmd: ( cmd !== undefined ) ? cmd : 'unknown',
			id: ( id !== undefined ) ? id : 0,
			type: 'DataTransport',
			/** @type {number} */
			progress: 0,
			buffers: {},
			params: {
			}
		};
		/** @type {ArrayBuffer[]} */
		this.transferables = [];

	}

	/**
	 * Populate this object with previously serialized data.
	 * @param {object} transportObject
	 * @return {DataTransport}
	 */
	loadData( transportObject ) {

		this.main.cmd = transportObject.cmd;
		this.main.id = transportObject.id;
		this.main.type = 'DataTransport';
		this.setProgress( transportObject.progress );
		this.setParams( transportObject.params );

		if ( transportObject.buffers ) {

			Object.entries( transportObject.buffers ).forEach( ( [name, buffer] ) => {

				this.main.buffers[ name ] = buffer;

			} );

		}
		return this;

	}

	/**
	 * Returns the value of the command.
	 * @return {string}
	 */
	getCmd () {

		return this.main.cmd;

	}

	/**
	 * Returns the id.
	 * @return {string}
	 */
	getId() {

		return this.main.id;

	}

	/**
	 * Set a parameter object which is a map with string keys and strings or objects as values.
	 * @param {object.<string, *>} params
	 * @return {DataTransport}
	 */
	setParams( params ) {

		if ( params !== null && params !== undefined ) {
			this.main.params = params;
		}
		return this;

	}

	/**
	 * Return the parameter object
	 * @return {object.<string, *>}
	 */
	getParams() {

		return this.main.params;

	}

	/**
	 * Set the current progress (e.g. percentage of progress)
	 * @param {number} numericalValue
	 * @return {DataTransport}
	 */
	setProgress( numericalValue ) {

		this.main.progress = numericalValue;
		return this;

	}

	/**
	 * Add a named {@link ArrayBuffer}
	 * @param {string} name
	 * @param {ArrayBuffer} buffer
	 * @return {DataTransport}
	 */
	addBuffer ( name, buffer ) {

		this.main.buffers[ name ] = buffer;
		return this;

	}

	/**
	 * Retrieve an {@link ArrayBuffer} by name
	 * @param {string} name
	 * @return {ArrayBuffer}
	 */
	getBuffer( name ) {

		return this.main.buffers[ name ];

	}

	/**
	 * Package all data buffers into the transferable array. Clone if data needs to stay in current context.
	 * @param {boolean} cloneBuffers
	 * @return {DataTransport}
	 */
	package( cloneBuffers ) {

		for ( let buffer of Object.values( this.main.buffers ) ) {

			if ( buffer !== null && buffer !== undefined ) {

				const potentialClone = cloneBuffers ? buffer.slice( 0 ) : buffer;
				this.transferables.push( potentialClone );

			}

		}
		return this;

	}

	/**
	 * Return main data object
	 * @return {object}
	 */
	getMain() {

		return this.main;

	}

	/**
	 * Return all transferable in one array.
	 * @return {ArrayBuffer[]}
	 */
	getTransferables() {

		return this.transferables;

	}

	/**
	 * Posts a message by invoking the method on the provided object.
	 * @param {object} postMessageImpl
	 * @return {DataTransport}
	 */
	postMessage( postMessageImpl ) {

		postMessageImpl.postMessage( this.main, this.transferables );
		return this;

	}
}

/**
 * Define a structure that is used to ship materials data between main and workers.
 */
class MaterialsTransport extends DataTransport {

	/**
	 * Creates a new {@link MeshMessageStructure}.
	 * @param {string} [cmd]
	 * @param {string} [id]
	 */
	constructor( cmd, id ) {

		super( cmd, id );
		this.main.type = 'MaterialsTransport';
		/** {object.<string, Material>} */
		this.main.materials = {};
		/** {object.<number, string>} */
		this.main.multiMaterialNames = {};
		this.main.cloneInstructions = [];

	}

	/**
	 * See {@link DataTransport#loadData}
	 * @param {object} transportObject
	 * @return {MaterialsTransport}
	 */
	loadData( transportObject ) {

		super.loadData( transportObject );
		this.main.type = 'MaterialsTransport';
		Object.assign( this.main, transportObject );

		const materialLoader = new MaterialLoader();
		Object.entries( this.main.materials ).forEach( ( [ name, materialObject ] ) => {

			this.main.materials[ name ] = materialLoader.parse( materialObject )

		} );
		return this;

	}

	_cleanMaterial ( material ) {

		Object.entries( material ).forEach( ( [key, value] ) => {

			if ( value instanceof Texture || value === null ) {
				material[ key ] = undefined;

			}

		} );
		return material;

	}

	/**
	 * See {@link DataTransport#loadData}
	 * @param {string} name
	 * @param {ArrayBuffer} buffer
	 * @return {MaterialsTransport}
	 */
	addBuffer( name, buffer ) {

		super.addBuffer( name, buffer );
		return this;

	}

	/**
	 * See {@link DataTransport#setParams}
	 * @param {object.<string, *>} params
	 * @return {MaterialsTransport}
	 */
	setParams( params ) {

		super.setParams( params );
		return this;

	}

	/**
	 * Set an object containing named materials.
	 * @param {object.<string, Material>} materials
	 */
	setMaterials ( materials ) {

		if ( materials !== undefined && materials !== null && Object.keys( materials ).length > 0 ) this.main.materials = materials;
		return this;

	}

	/**
	 * Returns all maerials
	 * @return {object.<string, Material>}
	 */
	getMaterials () {

		return this.main.materials;

	}

	/**
	 * Removes all textures and null values from all materials
	 */
	cleanMaterials () {

		let clonedMaterials = {};
		let clonedMaterial;
		for ( let material of Object.values( this.main.materials ) ) {

			if ( typeof material.clone === 'function' ) {

				clonedMaterial = material.clone();
				clonedMaterials[ clonedMaterial.name ] = this._cleanMaterial( clonedMaterial );

			}

		}
		this.setMaterials( clonedMaterials );
		return this;

	}

	/**
	 * See {@link DataTransport#package}
	 * @param {boolean} cloneBuffers
	 * @return {DataTransport}
	 */
	package ( cloneBuffers) {

		super.package( cloneBuffers );
		this.main.materials = MaterialUtils.getMaterialsJSON( this.main.materials );
		return this;

	}

	/**
	 * Tell whether a multi-material was defined
	 * @return {boolean}
	 */
	hasMultiMaterial () {

		return ( Object.keys( this.main.multiMaterialNames ).length > 0 );

	}

	/**
	 * Returns a single material if it is defined or null.
	 * @return {Material|null}
	 */
	getSingleMaterial () {

		if ( Object.keys( this.main.materials ).length > 0 ) {

			return Object.entries( this.main.materials )[ 0 ][ 1 ];

		} else {

			return null;

		}

	}

	/**
	 * Adds contained material or multi-material the provided materials object or it clones and adds new materials according clone instructions.
	 *
	 * @param {Object.<string, Material>} materials
	 * @param {boolean} log
	 *
	 * @return {Material|Material[]}
	 */
	processMaterialTransport ( materials, log ) {

		for ( let i = 0; i < this.main.cloneInstructions.length; i ++ ) {

			MaterialUtils.cloneMaterial( materials, this.main.cloneInstructions[ i ], log );

		}

		let outputMaterial;
		if ( this.hasMultiMaterial() ) {

			// multi-material
			outputMaterial = [];
			Object.entries( this.main.multiMaterialNames ).forEach( ( [ materialIndex, materialName ] ) => {

				outputMaterial[ materialIndex ] = materials[ materialName ];

			} );

		}
		else {

			const singleMaterial = this.getSingleMaterial();
			if (singleMaterial !== null ) {
				outputMaterial = materials[ singleMaterial.name ];
				if ( !outputMaterial ) outputMaterial = singleMaterial;
			}

		}
		return outputMaterial;

	}
}

/**
 * Define a structure that is used to send geometry data between main and workers.
 */
class GeometryTransport extends DataTransport {

	/**
	 * Creates a new {@link GeometryTransport}.
	 * @param {string} [cmd]
	 * @param {string} [id]
	 */
	constructor( cmd, id ) {

		super( cmd, id );
		this.main.type = 'GeometryTransport';
		// 0: mesh, 1: line, 2: point
		/** @type {number} */
		this.main.geometryType = 0;
		/** @type {object} */
		this.main.geometry = {};
		/** @type {BufferGeometry} */
		this.main.bufferGeometry = null;

	}

	/**
	 * See {@link DataTransport#loadData}
	 * @param {object} transportObject
	 * @return {GeometryTransport}
	 */
	loadData( transportObject ) {

		super.loadData( transportObject );
		this.main.type = 'GeometryTransport';
		return this.setGeometry( transportObject.geometry, transportObject.geometryType );

	}

	/**
	 * Returns the geometry type [0=Mesh|1=LineSegments|2=Points]
	 * @return {number}
	 */
	getGeometryType() {

		return this.main.geometryType;

	}

	/**
	 * See {@link DataTransport#setParams}
	 * @param {object} params
	 * @return {GeometryTransport}
	 */
	setParams( params ) {

		super.setParams( params );
		return this;

	}

	/**
	 * Set the {@link BufferGeometry} and geometry type that can be used when a mesh is created.
	 *
	 * @param {BufferGeometry} geometry
	 * @param {number} geometryType [0=Mesh|1=LineSegments|2=Points]
	 * @return {GeometryTransport}
	 */
	setGeometry( geometry, geometryType ) {
		this.main.geometry = geometry;
		this.main.geometryType = geometryType;
		if ( geometry instanceof BufferGeometry ) this.main.bufferGeometry = geometry;

		return this;
	}

	/**
	 * Package {@link BufferGeometry} and prepare it for transport.
	 *
	 * @param {boolean} cloneBuffers Clone buffers if their content shall stay in the current context.
	 * @return {GeometryTransport}
	 */
	package( cloneBuffers ) {

		super.package( cloneBuffers );
		const vertexBA = this.main.geometry.getAttribute( 'position' );
		const normalBA = this.main.geometry.getAttribute( 'normal' );
		const uvBA = this.main.geometry.getAttribute( 'uv' );
		const colorBA = this.main.geometry.getAttribute( 'color' );
		const skinIndexBA = this.main.geometry.getAttribute( 'skinIndex' );
		const skinWeightBA = this.main.geometry.getAttribute( 'skinWeight' );
		const indexBA = this.main.geometry.getIndex();

		this._addBufferAttributeToTransferable( vertexBA, cloneBuffers );
		this._addBufferAttributeToTransferable( normalBA, cloneBuffers );
		this._addBufferAttributeToTransferable( uvBA, cloneBuffers );
		this._addBufferAttributeToTransferable( colorBA, cloneBuffers );
		this._addBufferAttributeToTransferable( skinIndexBA, cloneBuffers );
		this._addBufferAttributeToTransferable( skinWeightBA, cloneBuffers );
		this._addBufferAttributeToTransferable( indexBA, cloneBuffers );
		return this;
	}

	/**
	 * Reconstructs the {@link BufferGeometry} from the raw buffers.
	 * @param {boolean} cloneBuffers
	 * @return {GeometryTransport}
	 */
	reconstruct( cloneBuffers ) {

		if ( this.main.bufferGeometry instanceof BufferGeometry ) return this;
		this.main.bufferGeometry = new BufferGeometry();

		const transferredGeometry = this.main.geometry;
		this._assignAttribute( transferredGeometry.attributes.position, 'position', cloneBuffers );
		this._assignAttribute( transferredGeometry.attributes.normal, 'normal', cloneBuffers );
		this._assignAttribute( transferredGeometry.attributes.uv, 'uv', cloneBuffers );
		this._assignAttribute( transferredGeometry.attributes.color, 'color', cloneBuffers );
		this._assignAttribute( transferredGeometry.attributes.skinIndex, 'skinIndex', cloneBuffers );
		this._assignAttribute( transferredGeometry.attributes.skinWeight, 'skinWeight', cloneBuffers );

		const index = transferredGeometry.index;
		if ( index !== null && index !== undefined ) {

			const indexBuffer = cloneBuffers ? index.array.slice( 0 ) : index.array;
			this.main.bufferGeometry.setIndex( new BufferAttribute( indexBuffer, index.itemSize, index.normalized ) );

		}
		const boundingBox = transferredGeometry.boundingBox;
		if ( boundingBox !== null ) this.main.bufferGeometry.boundingBox = Object.assign( new Box3(), boundingBox );

		const boundingSphere = transferredGeometry.boundingSphere;
		if ( boundingSphere !== null ) this.main.bufferGeometry.boundingSphere = Object.assign( new Sphere(), boundingSphere );

		this.main.bufferGeometry.uuid = transferredGeometry.uuid;
		this.main.bufferGeometry.name = transferredGeometry.name;
		this.main.bufferGeometry.type = transferredGeometry.type;
		this.main.bufferGeometry.groups = transferredGeometry.groups;
		this.main.bufferGeometry.drawRange = transferredGeometry.drawRange;
		this.main.bufferGeometry.userData = transferredGeometry.userData;
		return this;

	}

	/**
	 * Returns the {@link BufferGeometry}.
	 * @return {BufferGeometry|null}
	 */
	getBufferGeometry() {

		return this.main.bufferGeometry

	}

	_addBufferAttributeToTransferable( input, cloneBuffer ) {

		if ( input !== null && input !== undefined ) {

			const arrayBuffer = cloneBuffer ? input.array.slice( 0 ) : input.array;
			this.transferables.push( arrayBuffer.buffer );

		}
		return this;

	}

	_assignAttribute( attr, attrName, cloneBuffer ) {

		if ( attr ) {

			const arrayBuffer = cloneBuffer ? attr.array.slice( 0 ) : attr.array;
			this.main.bufferGeometry.setAttribute( attrName, new BufferAttribute( arrayBuffer, attr.itemSize, attr.normalized ) );

		}
		return this;

	}

}


/**
 * Define a structure that is used to send mesh data between main and workers.
 */
class MeshTransport extends GeometryTransport {

	/**
	 * Creates a new {@link MeshTransport}.
	 * @param {string} [cmd]
	 * @param {string} [id]
	 */
	constructor( cmd, id ) {

		super( cmd, id );
		this.main.type = 'MeshTransport';
		// needs to be added as we cannot inherit from both materials and geometry
		this.main.materialsTransport = new MaterialsTransport();

	}

	/**
	 * See {@link GeometryTransport#loadData}
	 * @param {object} transportObject
	 * @return {MeshTransport}
	 */
	loadData( transportObject ) {

		super.loadData( transportObject );
		this.main.type = 'MeshTransport';
		this.main.meshName = transportObject.meshName;
		this.main.materialsTransport = new MaterialsTransport().loadData( transportObject.materialsTransport.main );
		return this;

	}

	/**
	 * See {@link GeometryTransport#loadData}
	 * @param {object} params
	 * @return {MeshTransport}
	 */
	setParams( params ) {

		super.setParams( params );
		return this;

	}

	/**
	 * The {@link MaterialsTransport} wraps all info regarding the material for the mesh.
	 * @param {MaterialsTransport} materialsTransport
	 * @return {MeshTransport}
	 */
	setMaterialsTransport( materialsTransport ) {

		if ( materialsTransport instanceof MaterialsTransport ) this.main.materialsTransport = materialsTransport;
		return this;

	}

	/**
	 * @return {MaterialsTransport}
	 */
	getMaterialsTransport() {

		return this.main.materialsTransport;

	}

	/**
	 * Sets the mesh and the geometry type [0=Mesh|1=LineSegments|2=Points]
	 * @param {Mesh} mesh
	 * @param {number} geometryType
	 * @return {MeshTransport}
	 */
	setMesh( mesh, geometryType ) {

		this.main.meshName = mesh.name;
		super.setGeometry( mesh.geometry, geometryType );
		return this;

	}

	/**
	 * See {@link GeometryTransport#package}
	 * @param {boolean} cloneBuffers
	 * @return {MeshTransport}
	 */
	package( cloneBuffers ) {

		super.package( cloneBuffers );
		if ( this.main.materialsTransport !== null ) this.main.materialsTransport.package( cloneBuffers );
		return this;
	}

	/**
	 * See {@link GeometryTransport#reconstruct}
	 * @param {boolean} cloneBuffers
	 * @return {MeshTransport}
	 */
	reconstruct( cloneBuffers ) {

		super.reconstruct( cloneBuffers );
		// so far nothing needs to be done for material
		return this;

	}

}


/**
 * Utility for serializing object in memory
 */
class ObjectUtils {

	/**
	 * Serializes a class with an optional prototype
	 * @param targetClass
	 * @param targetPrototype
	 * @param fullObjectName
	 * @param processPrototype
	 * @return {string}
	 */
	static serializePrototype( targetClass, targetPrototype, fullObjectName, processPrototype ) {

		let prototypeFunctions = [];
		let objectString = '';
		let target;
		if ( processPrototype ) {
			objectString = targetClass.toString() + "\n\n"
			target = targetPrototype;
		} else {
			target = targetClass;
		}
		for ( let name in target ) {

			let objectPart = target[ name ];
			let code = objectPart.toString();

			if ( typeof objectPart === 'function' ) {

				prototypeFunctions.push( '\t' + name + ': ' + code + ',\n\n' );

			}

		}

		let protoString = processPrototype ? '.prototype' : '';
		objectString += fullObjectName + protoString + ' = {\n\n';
		for ( let i = 0; i < prototypeFunctions.length; i ++ ) {

			objectString += prototypeFunctions[ i ];

		}
		objectString += '\n}\n;';
		return objectString;

	}

	/**
	 * Serializes a class.
	 * @param {object} targetClass An ES6+ class
	 * @return {string}
	 */
	static serializeClass( targetClass ) {

		return targetClass.toString() + "\n\n";

	}

}


/**
 * Object manipulation utilities.
 */
class ObjectManipulator {

	/**
	 * Applies values from parameter object via set functions or via direct assignment.
	 *
	 * @param {Object} objToAlter The objToAlter instance
	 * @param {Object} params The parameter object
	 * @param {boolean} forceCreation Force the creation of a property
	 */
	static applyProperties ( objToAlter, params, forceCreation ) {

		// fast-fail
		if ( objToAlter === undefined || objToAlter === null || params === undefined || params === null ) return;

		let property, funcName, values;
		for ( property in params ) {

			funcName = 'set' + property.substring( 0, 1 ).toLocaleUpperCase() + property.substring( 1 );
			values = params[ property ];

			if ( typeof objToAlter[ funcName ] === 'function' ) {

				objToAlter[ funcName ]( values );

			} else if ( objToAlter.hasOwnProperty( property ) || forceCreation ) {

				objToAlter[ property ] = values;

			}

		}

	}

}

export {
	DataTransport,
	GeometryTransport,
	MeshTransport,
	MaterialsTransport,
	ObjectUtils,
	ObjectManipulator,
	DeUglify
}
