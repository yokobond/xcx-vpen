import BlockType from '../../extension-support/block-type';
import ArgumentType from '../../extension-support/argument-type';
import Cast from '../../util/cast';
import TargetType from '../../extension-support/target-type';
import RenderedTarget from '../../sprites/rendered-target';
import StageLayering from '../../engine/stage-layering';
import Clone from '../../util/clone';

import translations from './translations.json';
import blockIcon from './block-icon.png';
import {Fragment, SVG} from '@svgdotjs/svg.js';
import FileSaver from 'file-saver';

/**
 * The number of millimeters per pixel.
 * @type {number}
 */
const MM_PER_PX = 25.4 / 96;

/**
 * Formatter which is used for translation.
 * This will be replaced which is used in the runtime.
 * @param {object} messageData - format-message object
 * @returns {string} - message for the locale
 */
let formatMessage = messageData => messageData.default;

/**
 * Setup format-message for this extension.
 */
const setupTranslations = () => {
    const localeSetup = formatMessage.setup();
    if (localeSetup && localeSetup.translations[localeSetup.locale]) {
        Object.assign(
            localeSetup.translations[localeSetup.locale],
            translations[localeSetup.locale]
        );
    }
};

const EXTENSION_ID = 'xcxVPen';

/**
 * URL to get this extension as a module.
 * When it was loaded as a module, 'extensionURL' will be replaced a URL which is retrieved from.
 * @type {string}
 */
let extensionURL = 'https://yokobond.github.io/xcx-vpen/dist/xcxVPen.mjs';

/**
 * Scratch 3.0 blocks for example of Xcratch.
 */
class VPenBlocks {
    /**
     * A translation object which is used in this class.
     * @param {FormatObject} formatter - translation object
     */
    static set formatMessage (formatter) {
        formatMessage = formatter;
        if (formatMessage) setupTranslations();
    }

    /**
     * @return {string} - the name of this extension.
     */
    static get EXTENSION_NAME () {
        return formatMessage({
            id: 'xcxVPen.name',
            default: 'Vector Pen',
            description: 'name of the extension'
        });
    }

    /**
     * @return {string} - the ID of this extension.
     */
    static get EXTENSION_ID () {
        return EXTENSION_ID;
    }

    /**
     * URL to get this extension.
     * @type {string}
     */
    static get extensionURL () {
        return extensionURL;
    }

    /**
     * Set URL to get this extension.
     * The extensionURL will be changed to the URL of the loading server.
     * @param {string} url - URL
     */
    static set extensionURL (url) {
        extensionURL = url;
    }

    static get STATE_KEY () {
        return 'XCX_VPEN_STATE';
    }

    /**
     * The minimum stroke width for display purposes.
     * @type {number}
     */
    static get DISPLAY_STROKE_WIDTH_MIN () {
        return 0.1;
    }

    /**
     * The types of pen.
     */
    static get PEN_TYPES () {
        return {
            TRAIL: 'trail',
            PLOTTER: 'plotter'
        };
    }

    /**
     * The default state of the vector pen.
     * @type {object}
     * @property {int} skinID - the ID of the renderer Skin corresponding to the pen layer.
     * @property {Path} penPath - the current pen line.
     * @property {Container} drawing - the container for the pen lines.
     * @property {object} penAttributes - the pen attributes.
     * @property {Array.<number>} penAttributes.color3b - the pen color[RGB 0-255].
     * @property {number} penAttributes.diameter - the pen diameter[mm].
     * @property {object} referencePoint - the reference point for the plotter pen.
     */
    static get DEFAULT_PEN_STATE () {
        return {
            skinID: -1,
            penType: VPenBlocks.PEN_TYPES.TRAIL,
            penPath: null,
            drawing: null,
            penAttributes: {
                color3b: {r: 0, g: 0, b: 0}, // RGB 0-255,
                opacity: 1, // 0-1
                diameter: 1 // mm
            },
            referencePoint: null
        };
    }

    /**
     * Construct a set of blocks for vector pen.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        if (runtime.formatMessage) {
            // Replace 'formatMessage' to a formatter which is used in the runtime.
            formatMessage = runtime.formatMessage;
        }

        const [stageWidth, stageHeight] = this.runtime.renderer.getNativeSize();
        this.stageWidth = stageWidth;
        this.stageHeight = stageHeight;
        this.stepPerMM = stageHeight / 180; // 180mm is the height of the stage

        this.onTargetCreated = this.onTargetCreated.bind(this);
        this.onTargetMoved = this.onTargetMoved.bind(this);

        runtime.on('targetWasCreated', this.onTargetCreated);
        runtime.on('RUNTIME_DISPOSED', this.clearAll.bind(this));
    }

    _mmToPx (mm) {
        return mm / MM_PER_PX;
    }

    _pxToMM (px) {
        return px * MM_PER_PX;
    }

    /**
     * Create a new SVG drawing for the pen layer.
     * @returns {SVG} - the new SVG drawing.
     */
    _createDrawingSVG () {
        const stageWidth = this.stageWidth;
        const stageHeight = this.stageHeight;
        const dummy = document.implementation.createHTMLDocument();
        return SVG()
            .addTo(dummy.body)
            .size(`${stageWidth}`,
                `${stageHeight}`)
            .viewbox(0, 0, stageWidth, stageHeight);
    }

    /**
     * Retrieve the ID of the renderer "Skin" corresponding to the pen layer. If
     * the pen Skin doesn't yet exist, create it.
     * @param {Target} target - the target to query.
     * @returns {int} the Skin ID of the pen layer, or -1 on failure.
     * @private
     */
    _getPenLayerIDFor (target) {
        const penState = this._getPenState(target);
        const renderer = this.runtime.renderer;
        if (penState.skinID < 0 && renderer) {
            const drawing = penState.drawing;
            penState.skinID = this.runtime.renderer
                .createSVGSkin(this.convertSVGForPenLayer(drawing.svg()));
            penState.drawableID = this.runtime.renderer.createDrawable(StageLayering.PEN_LAYER);
            renderer.updateDrawableSkinId(penState.drawableID, penState.skinID);
        }
        return penState.skinID;
    }

    _penStateFor (target) {
        return target.getCustomState(VPenBlocks.STATE_KEY);
    }

    /**
     * Get the state of the pen for the target.
     * Initializes the pen state if it doesn't exist.
     * @param {Target} target - the target to query.
     * @return {object} - the pen state.
     * @property {int} skinID - the ID of the renderer Skin corresponding to the pen layer.
     * @property {Path} penPath - the current pen line.
     * @property {Container} drawing - the container for the pen lines.
     * @property {object} penAttributes - the pen attributes.
     * @property {Array.<number>} penAttributes.color3b - the pen color[RGB 0-255].
     * @property {number} penAttributes.diameter - the pen diameter[mm].
     * @property {object} referencePoint - the reference point for the plotter pen.
     * @private
     */
    _getPenState (target) {
        let penState = target.getCustomState(VPenBlocks.STATE_KEY);
        if (!penState) {
            penState = Clone.simple(VPenBlocks.DEFAULT_PEN_STATE);
            target.setCustomState(VPenBlocks.STATE_KEY, penState);
        }
        if (!penState.drawing) {
            penState.drawing = this._createDrawingSVG();
        }
        return penState;
    }

    _clearForTarget (target) {
        const penState = this._penStateFor(target);
        if (!penState || !penState.drawing) {
            return;
        }
        penState.drawing.remove();
        penState.drawing = null;
        if (penState.penPath) {
            this._startPenPath(target);
        }
        this._updatePenSkinFor(target);
    }

    _updatePenSkinFor (target) {
        const penSkinId = this._getPenLayerIDFor(target);
        if (penSkinId < 0) {
            throw new Error('No SVG Skin ID');
        }
        const drawing = this._penStateFor(target).drawing;
        this.runtime.renderer.updateSVGSkin(
            penSkinId,
            this.convertSVGForPenLayer(drawing.svg()));
        this.runtime.requestRedraw();
    }

    _mapToSVGViewBox (x, y) {
        return [(x + 240), (180 - y)];
    }

    _startPenPath (target) {
        const penState = this._getPenState(target);
        if (penState.penType === VPenBlocks.PEN_TYPES.PLOTTER) {
            if (penState.referencePoint) {
                penState.penPath.array().pop();
                penState.referencePoint = null;
            }
        }
        if (penState.penPath) {
            if (penState.penPath.array().length === 1) {
                // If the pen line only has one point, it should be a dot.
                penState.penPath.array()
                    .push(['L', ...penState.penPath.array()[0].slice(1)]);
                penState.penPath.plot(penState.penPath.array());
            }
        }
        const penPath = penState.drawing.path(['M', ...this._mapToSVGViewBox(target.x, target.y)]);
        penPath
            .fill('none')
            .stroke({
                width: penState.penAttributes.diameter * this.stepPerMM,
                color: penState.penAttributes.color3b,
                opacity: penState.penAttributes.opacity,
                linecap: 'round',
                linejoin: 'round'
            });
        penState.penPath = penPath;
    }

    _addLineToPenPath (path, x, y) {
        path.array()
            .push(['L', ...this._mapToSVGViewBox(x, y)]);
        path.plot(path.array());
    }

    /**
     * Clamp a pen size value to the range allowed by the pen.
     * @param {number} requestedSize - the requested pen size.
     * @returns {number} the clamped size.
     * @private
     */
    _clampPenSize (requestedSize) {
        return Math.max(0, requestedSize);
    }

    /**
     * Get the SVG for the pen layer.
     * @param {string} svg - the SVG string.
     * @returns {string} - the SVG string for the pen layer.
     */
    convertSVGForPenLayer (svg) {
        // Ensure that all strokes have a minimum width for visibility.
        const thinStrokeWidth = VPenBlocks.DISPLAY_STROKE_WIDTH_MIN;
        return svg.replace(
            /stroke-width="([^"]+)"/g,
            (match, strokeWidth) => {
                if (parseFloat(strokeWidth) < thinStrokeWidth) {
                    return `stroke-width="${thinStrokeWidth}"`;
                }
                return match;
            });
    }

    /**
     * Return the step per mm.
     * @returns {number} - the step per mm.
     */
    getStepPerMM () {
        return this.stepPerMM;
    }

    /**
     * Return the step for the given mm.
     * @param {object} args - the block arguments.
     * @param {number} args.MM - the mm.
     * @returns {number} - the step.
     */
    stepForMM (args) {
        return Cast.toNumber(args.MM) * this.stepPerMM;
    }

    /**
     * Return the mm for the given step.
     * @param {object} args - the block arguments.
     * @param {number} args.STEP - the step.
     * @returns {number} - the mm.
     */
    mmForStep (args) {
        return Cast.toNumber(args.STEP) / this.stepPerMM;
    }

    /**
     * Set the step per mm.
     * @param {object} args - the block arguments.
     * @param {number} args.STEP_PER_MM - the step per mm.
     */
    setStepPerMM (args) {
        this.stepPerMM = Cast.toNumber(args.STEP_PER_MM);
    }

    /**
     * When a pen-using Target is cloned, clone the pen state.
     * @param {Target} newTarget - the newly created target.
     * @param {Target} [sourceTarget] - the target used as a source for the new clone, if any.
     * @listens Runtime#event:targetWasCreated
     * @private
     */
    onTargetCreated (newTarget, sourceTarget) {
        if (sourceTarget) {
            const penState = sourceTarget.getCustomState(VPenBlocks.STATE_KEY);
            if (penState) {
                // @TODO: Design a way to clone the skin.
                newTarget.setCustomState(VPenBlocks.STATE_KEY, Clone.simple(penState));
                if (penState.penPath) {
                    if (penState.penType === VPenBlocks.PEN_TYPES.TRAIL) {
                        newTarget.addListener(RenderedTarget.EVENT_TARGET_MOVED, this.onTargetMoved);
                    }
                }
            }
        }
    }

    /**
     * Handle a target which has moved. This only fires when the pen is down.
     * @param {RenderedTarget} target - the target which has moved.
     * @param {number} oldX - the previous X position.
     * @param {number} oldY - the previous Y position.
     * @param {boolean} isForce - whether the movement was forced.
     * @private
     */
    onTargetMoved (target, oldX, oldY, isForce) {
        const penState = this._penStateFor(target);
        const penPath = penState.penPath;
        if (!penPath) {
            // If the pen is up, there's nothing to draw.
            return;
        }
        if (penState.penType === VPenBlocks.PEN_TYPES.PLOTTER) {
            // Display the pen path for current position.
            if (penState.referencePoint) {
                penPath.array().pop();
            }
            penState.referencePoint = null;
        }
        if (isForce) {
            // Only move the pen if the movement isn't forced (ie. dragged).
            // This prevents the pen from drawing when the sprite is dragged.
            this._startPenPath(target);
        } else {
            penState.referencePoint = {x: target.x, y: target.y};
            this._addLineToPenPath(penPath, target.x, target.y);
        }
        this._updatePenSkinFor(target);
    }

    plot (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const penPath = penState.penPath;
        if (!penPath) {
            // If there's no line started, there's nothing to end.
            return;
        }
        if (penState.referencePoint) {
            penPath.array().pop();
            penState.referencePoint = null;
        }
        this._addLineToPenPath(penPath, target.x, target.y);
        this._updatePenSkinFor(target);
    }

    /**
     * The pen "pen down" block causes the target to leave pen trails on future motion.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    penDown (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        if (penState.penType === args.PEN_TYPE) {
            if (penState.penPath) {
                // If there's already a line started, end it.
                return;
            }
        }
        penState.penType = args.PEN_TYPE;
        this._startPenPath(target);
        this._updatePenSkinFor(target);
        target.addListener(RenderedTarget.EVENT_TARGET_MOVED, this.onTargetMoved);
    }

    /**
     * The pen "pen up" block stops the target from leaving pen trails.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    penUp (args, util) {
        const target = util.target;
        const penState = this._penStateFor(target);
        const penPath = penState.penPath;
        if (!penPath) {
            // If there's no line started, there's nothing to end.
            return;
        }
        const linePoints = penPath.array();
        if (linePoints.length === 1) {
            // If the pen line only has one point, it hasn't been drawn yet.
            this._addLineToPenPath(penPath, target.x, target.y);
            this._updatePenSkinFor(target);
        }
        penState.penPath = null;
        penState.referencePoint = null;
        target.removeListener(RenderedTarget.EVENT_TARGET_MOVED, this.onTargetMoved);
    }

    /**
     * Clears the drawings of this target.
     * @param {object} _args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    clear (_args, util) {
        const target = util.target;
        this._clearForTarget(target);
    }

    /**
     * Set the pen color by color tool.
     * @param {object} args - the block arguments.
     * @param {string|number} args.COLOR - the color to set the pen to.
     * @param {object} util - utility object provided by the runtime.
     */
    setPenColorToColor (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const rgba = Cast.toRgbColorObject(args.COLOR);
        if (penState.penAttributes.color3b.r === rgba.r &&
            penState.penAttributes.color3b.g === rgba.g &&
            penState.penAttributes.color3b.b === rgba.b &&
            penState.penAttributes.opacity === rgba.a / 255) {
            // No change.
            return;
        }
        penState.penAttributes.color3b = {
            r: rgba.r,
            g: rgba.g,
            b: rgba.b
        };
        penState.penAttributes.opacity = rgba.a / 255;
        const penPath = penState.penPath;
        if (penPath) {
            // If there's a pen line started, end it and start a new one.
            this._startPenPath(target);
        }
    }

    /**
     * Set the pen size (mm).
     * @param {object} args - the block arguments.
     * @param {number} args.SIZE - the size of the pen in mm.
     * @param {object} util - utility object provided by the runtime.
     */
    setPenSizeTo (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const newPenSize = this._clampPenSize(Cast.toNumber(args.SIZE));
        if (penState.penAttributes.diameter === newPenSize) {
            // No change.
            return;
        }
        penState.penAttributes.diameter = newPenSize;
        const penPath = penState.penPath;
        if (penPath) {
            // If there's a pen line started, end it and start a new one.
            this._startPenPath(target);
        }
    }

    /**
     * The pen "stamp" block stamps the current drawable's image onto the pen layer.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    stamp (args, util) {
        const target = util.target;
        const drawable = target.drawableID;
        const drawableData = this.runtime.renderer.extractDrawableScreenSpace(drawable);
        // Get the dataURL of the drawable
        const canvas = document.createElement('canvas');
        canvas.width = drawableData.imageData.width;
        canvas.height = drawableData.imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(drawableData.imageData, 0, 0);
        const drawableURL = canvas.toDataURL();
        // Stamp the drawable onto the pen layer
        const penState = this._getPenState(target);
        const drawing = penState.drawing;
        const stamp = drawing.image(drawableURL);
        stamp.move(drawableData.x, drawableData.y);
        stamp.size(drawableData.width, drawableData.height);
        stamp.opacity((100 - target.effects.ghost) / 100);
        this._updatePenSkinFor(target);
    }

    /**
     * Clears the pen layer's contents.
     */
    clearAll () {
        if (!this.downloadSVG) {
            return;
        }
        this.runtime.targets.forEach(target => {
            this._clearForTarget(target);
        });
    }

    /**
     * Get the SVG for the pen layer of the target.
     * @param {Target} target - the target to query.
     * @returns {Container} - cloned SVG container for the pen layer.
     */
    _getSVGFor (target) {
        const penState = this._penStateFor(target);
        if (!penState || !penState.drawing) {
            return '';
        }
        return penState.drawing.children().clone();
    }

    /**
     * Save the SVG drawing.
     * @param {object} args - the block arguments.
     * @param {string} args.NAME - the name of the file to save.
     * @param {object} util - utility object provided by the runtime.
     * @returns {Promise} - a promise that resolves after the file has been saved.
     */
    downloadSVG (args, util) {
        let name = Cast.toString(args.NAME);
        if (name === '') {
            name = util.target.sprite.name;
        }
        const saveDrawing = this._createDrawingSVG();
        util.runtime.targets.filter(target => target.isSprite())
            .forEach(target => {
                const penState = this._penStateFor(target);
                if (!penState || !penState.drawing) {
                    return '';
                }
                const targetDrawing = new Fragment();
                const layer = targetDrawing.group();
                layer.id(target.sprite.name);
                penState.drawing.children().forEach(child => {
                    layer.add(child.clone());
                });
                saveDrawing.add(targetDrawing);
            });
        const saveData = saveDrawing
            .size(
                `${this.stageWidth / this.stepPerMM}mm`,
                `${this.stageHeight / this.stepPerMM}mm`
            )
            .svg();
        const blob = new Blob([saveData], {type: 'application/octet-stream'});
        return FileSaver.saveAs(blob, `${name}.svg`);
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        setupTranslations();
        return {
            id: VPenBlocks.EXTENSION_ID,
            name: VPenBlocks.EXTENSION_NAME,
            extensionURL: VPenBlocks.extensionURL,
            blockIconURI: blockIcon,
            showStatusButton: false,
            blocks: [
                {
                    opcode: 'clear',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.clear',
                        default: 'clear of this sprite',
                        description: 'clear the pen trails of the sprite'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'stamp',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'pen.stamp',
                        default: 'stamp',
                        description: 'stamp a copy of the sprite'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'penDown',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.penDown',
                        default: '[PEN_TYPE] pen down',
                        description: 'start leaving a trail when the sprite moves'
                    }),
                    arguments: {
                        PEN_TYPE: {
                            type: ArgumentType.STRING,
                            menu: 'penTypesMenu',
                            defaultValue: 'trail'
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'penUp',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'pen.penUp',
                        default: 'pen up',
                        description: 'stop leaving a trail behind the sprite'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'plot',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.plot',
                        default: 'plot',
                        description: 'plot a node of the path'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setPenColorToColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'pen.setColor',
                        default: 'set pen color to [COLOR]',
                        description: 'set the pen color to a particular (RGB) value'
                    }),
                    arguments: {
                        COLOR: {
                            type: ArgumentType.COLOR
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setPenSizeTo',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.setSize',
                        default: 'set pen size to [SIZE] mm',
                        description: 'set the diameter of a trail left by a sprite'
                    }),
                    arguments: {
                        SIZE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'clearAll',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.clearAll',
                        default: 'erase all',
                        description: 'erase all pen trails and stamps'
                    })
                },
                {
                    opcode: 'stepForMM',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'xcxVPen.stepForMM',
                        default: 'steps for [MM] mm',
                        description: 'convert millimeters to steps'
                    }),
                    arguments: {
                        MM: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'mmForStep',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'xcxVPen.mmForStep',
                        default: 'mm for [STEP] steps',
                        description: 'convert steps to millimeters'
                    }),
                    arguments: {
                        STEP: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    }
                },
                {
                    opcode: 'getStepPerMM',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'xcxVPen.getStepPerMM',
                        default: 'step/mm',
                        description: 'step per mm'
                    })
                },
                {
                    opcode: 'setStepPerMM',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.setStepPerMM',
                        default: 'set step/mm to [STEP_PER_MM]',
                        description: 'set step per mm'
                    }),
                    arguments: {
                        STEP_PER_MM: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 2
                        }
                    },
                    fillter: [TargetType.SPRITE]
                },
                {
                    opcode: 'downloadSVG',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.downloadSVG',
                        default: 'download SVG named [NAME]',
                        description: 'download the SVG drawing'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: 'drawing'
                        }
                    }
                }
            ],
            menus: {
                penTypesMenu: {
                    acceptReporters: false,
                    items: 'getPenTypesMenuItems'
                }
            }
        };
    }

    getPenTypesMenuItems () {
        return [
            {
                text: formatMessage({
                    id: 'xcxVPen.penTypesMenu.trail',
                    default: 'trail',
                    description: 'pen type'
                }),
                value: VPenBlocks.PEN_TYPES.TRAIL
            },
            {
                text: formatMessage({
                    id: 'xcxVPen.penTypesMenu.plotter',
                    default: 'plotter',
                    description: 'plotter pen type'
                }),
                value: VPenBlocks.PEN_TYPES.PLOTTER
            }
        ];
    }
}

export {VPenBlocks as default, VPenBlocks as blockClass};
