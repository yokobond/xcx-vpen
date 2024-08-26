import BlockType from '../../extension-support/block-type';
import ArgumentType from '../../extension-support/argument-type';
import Cast from '../../util/cast';
import TargetType from '../../extension-support/target-type';
import RenderedTarget from '../../sprites/rendered-target';
import StageLayering from '../../engine/stage-layering';
import Clone from '../../util/clone';

import translations from './translations.json';
import blockIcon from './block-icon.png';
import {SVG} from '@svgdotjs/svg.js';
import FileSaver from 'file-saver';


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

    /**
     * The minimum stroke width for display purposes.
     * @type {number}
     */
    static get DISPLAY_STROKE_WIDTH_MIN () {
        return 0.1;
    }

    /**
     * The types of pen.
     * @type {object}
     * @property {string} TRAIL - trail pen.
     * @property {string} PLOTTER - plotter pen.
     */
    static get PEN_TYPES () {
        return {
            TRAIL: 'trail',
            PLOTTER: 'plotter'
        };
    }

    /**
     * The types of line shapes.
     * @type {object}
     * @property {string} STRAIGHT - straight line.
     * @property {string} CURVE - curve line.
     */
    static get LINE_SHAPES () {
        return {
            STRAIGHT: 'straight',
            CURVE: 'curve'
        };
    }

    /**
     * The name of layers.
     * @type {object}
     * @property {string} TOP - the top layer.
     * @property {string} BOTTOM - the bottom layer.
     */
    static get CHANGE_LAYER () {
        return {
            TOP: 'top',
            BOTTOM: 'bottom'
        };
    }

    /**
     * The directions to move the pen layer.
     * @type {object}
     * @property {string} UP - move the pen layer up.
     * @property {string} DOWN - move the pen layer down.
     */
    static get MOVE_LAYER () {
        return {
            UP: 'up',
            DOWN: 'down'
        };
    }

    /**
     * The default state of the vector pen.
     * @type {object}
     * @property {int} skinID - the ID of the renderer Skin corresponding to the pen layer.
     * @property {int} drawableID - the ID of the renderer Drawable corresponding to the pen layer.
     * @property {Path} penPath - the current pen line.
     * @property {Container} drawing - the container for the pen lines.
     * @property {object} penAttributes - the pen attributes.
     * @property {object} penAttributes.color3b - the pen color[RGB 0-255].
     * @property {number} penAttributes.diameter - the pen diameter[mm].
     * @property {string} penAttributes.lineShape - the shape of the line.
     * @property {object} penAttributes.fillColor3b - the fill color[RGB 0-255].
     * @property {number} penAttributes.fillOpacity - the fill opacity.
     * @property {object} referencePoint - the reference point for the plotter pen.
     */
    static get DEFAULT_PEN_STATE () {
        return {
            skinID: -1,
            drawableID: -1,
            penType: VPenBlocks.PEN_TYPES.TRAIL,
            penPath: null,
            drawing: null,
            penAttributes: {
                color3b: {r: 0, g: 0, b: 0}, // RGB 0-255,
                opacity: 1, // 0.0-1.0
                diameter: 1, // mm
                lineShape: VPenBlocks.LINE_SHAPES.STRAIGHT,
                fillColor3b: {r: 0, g: 0, b: 0}, // RGB 0-255,
                fillOpacity: 0 // 0.0-1.0
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

        /**
         * The pen states for each target.
         * @type {object.<string, object>}
         */
        this._penStates = {};

        const [stageWidth, stageHeight] = this.runtime.renderer.getNativeSize();
        this._updateStageSize(stageWidth, stageHeight);

        /**
         * The step per mm.
         * @type {number}
         */
        this.stepPerMM = 2; // 180mm for stage height

        // Bind event handlers.
        this.onTargetMoved = this.onTargetMoved.bind(this);

        // Register block to the runtime.
        runtime.on('targetWasCreated', this.onTargetCreated.bind(this));
        runtime.on('targetWasRemoved', this.onTargetWillExit.bind(this));
        runtime.on('RUNTIME_DISPOSED', this.onRuntimeDisposed.bind(this));
    }

    /**
     * Update the stage size.
     * @param {number} stageWidth - the width of the stage.
     * @param {number} stageHeight - the height of the stage.
     */
    _updateStageSize (stageWidth, stageHeight) {
        /**
         * The width of the stage.
         * @type {number}
         */
        this.stageWidth = stageWidth;

        /**
         * The height of the stage.
         * @type {number}
         */
        this.stageHeight = stageHeight;

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
    _getSkinIDFor (target) {
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

    /**
     * Get the state of the pen for the target if it exists.
     * If the state doesn't exist, return null.
     * @param {Target} target - the target to query.
     * @return {object?} - the pen state or null.
     */
    _penStateFor (target) {
        const targetID = target.id;
        return this._penStates[targetID];
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
     * @property {object} penAttributes.color3b - the pen color[RGB 0-255].
     * @property {number} penAttributes.diameter - the pen diameter[mm].
     * @property {string} penAttributes.lineShape - the shape of the line.
     * @property {object} penAttributes.fillColor3b - the fill color[RGB 0-255].
     * @property {number} penAttributes.fillOpacity - the fill opacity.
     * @property {object} referencePoint - the reference point for the plotter pen.
     * @private
     */
    _getPenState (target) {
        let penState = this._penStateFor(target);
        if (!penState) {
            penState = Clone.simple(VPenBlocks.DEFAULT_PEN_STATE);
            this._penStates[target.id] = penState;
        }
        if (!penState.drawing) {
            penState.drawing = this._createDrawingSVG();
        }
        return penState;
    }

    /**
     * Clear the pen layer for the target.
     * @param {Target} target - the target to clear the pen layer for.
     */
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

    /**
     * Update the pen skin for the target.
     * @param {Target} target - the target to update the pen skin for.
     */
    _updatePenSkinFor (target) {
        const penSkinId = this._getSkinIDFor(target);
        if (penSkinId < 0) {
            throw new Error('No SVG Skin ID');
        }
        const penState = this._penStateFor(target);
        const svg = penState.drawing.root();
        this.runtime.renderer.updateSVGSkin(
            penSkinId,
            this.convertSVGForPenLayer(svg.svg()));
        this.runtime.requestRedraw();
    }

    /**
     * Map the x, y position to the SVG viewBox.
     * @param {number} x - the x position on the stage.
     * @param {number} y - the y position on the stage.
     * @returns {Array.<number>} - the x, y position on the SVG viewBox.
     */
    _mapToSVGViewBox (x, y) {
        return [x + (this.stageWidth / 2), (this.stageHeight / 2) - y];
    }

    /**
     * Finish the current pen.
     * @param {object} penState - the pen state.
     */
    _finishPen (penState) {
        if (!penState.penPath) {
            return;
        }
        this._removeReferenceLine(penState);
        const penPath = penState.penPath;
        penState.penPath = null;
        const plots = penPath.array();
        if (plots.length === 1) {
            // If the pen line only has one instruction (MoveTo), it hasn't been drawn yet.
            penPath.remove();
            return;
        }
        if (plots.length === 2) {
            return;
        }
        // Close the path if it's a closed line.
        const start = (plots[1][0] === 'L') ? plots[0] : plots[1];
        const lastLine = plots[plots.length - 1]; // L or T
        const tolerance = 0.5;
        if (((start[1] - lastLine[1]) ** 2) + ((start[2] - lastLine[2]) ** 2) >
            tolerance ** 2) {
            return;
        }
        // It's a closed line.
        const firstLine = plots[1]; // L or Q
        if (firstLine[0] === 'Q' && lastLine[0] === 'T') {
            plots.pop(); // remove T
            plots.push([...plots[1]]); // copy the first Q to the end
            plots[0] = ['M', ...plots[1].slice(3)]; // move the start to the control point of the first Q
            plots.splice(1, 1); // remove the first Q
        }
        penPath.plot(plots.concat(['Z']));
    }

    /**
     * Remove the last reference point for the plotter pen.
     * @param {object} penState - the pen state.
     */
    _removeReferenceLine (penState) {
        if (!penState.referencePoint) {
            return;
        }
        const penPath = penState.penPath;
        if (penState.penAttributes.lineShape === VPenBlocks.LINE_SHAPES.CURVE) {
            penPath.array().pop(); // remove T
            const referenceCurve = penPath.array().pop(); // Q
            penPath.array().push(['T', referenceCurve[1], referenceCurve[2]]);
        } else {
            // The reference is a straight line.
            penState.penPath.array().pop();
        }
        penPath.plot(penPath.array());
        penState.referencePoint = null;
    }

    /**
     * Start a new pen path for the target.
     * @param {Target} target - the target to start the pen path for.
     */
    _startPenPath (target) {
        const penState = this._getPenState(target);
        this._finishPen(penState);
        const newPath = penState.drawing.path(['M', ...this._mapToSVGViewBox(target.x, target.y)]);
        newPath
            .fill(penState.penAttributes.fillOpacity > 0 ? {
                color: penState.penAttributes.fillColor3b,
                opacity: penState.penAttributes.fillOpacity
            } : 'none')
            .stroke({
                width: penState.penAttributes.diameter * this.stepPerMM,
                color: penState.penAttributes.color3b,
                opacity: penState.penAttributes.opacity,
                linecap: 'round',
                linejoin: 'round'
            });
        penState.penPath = newPath;
    }

    /**
     * Add a line to the pen path for the target.
     * @param {Path} path - the path to add the line to.
     * @param {number} x - the x position of the line.
     * @param {number} y - the y position of the line.
     */
    _addLineToPenPath (path, x, y) {
        path.array()
            .push(['L', ...this._mapToSVGViewBox(x, y)]);
        path.plot(path.array());
    }

    /**
     * Add a line to the pen path for the target.
     * @param {Path} path - the path to add the line to.
     * @param {number} x - the x position of the line.
     * @param {number} y - the y position of the line.
     */
    _addCurveToPenPath (path, x, y) {
        const pathArray = path.array();
        const prevNode = pathArray[pathArray.length - 1]; // T or M or L
        if (prevNode[0] === 'T') {
            pathArray.pop();
        }
        const prevPoint = [prevNode[1], prevNode[2]];
        const endPoint = this._mapToSVGViewBox(x, y);
        const controlPoint = [
            (prevPoint[0] + endPoint[0]) / 2,
            (prevPoint[1] + endPoint[1]) / 2
        ];
        pathArray.push(['Q', ...prevPoint, ...controlPoint]);
        pathArray.push(['T', ...endPoint]);
        path.plot(pathArray);
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
     * Clear pen layer for the target.
     * @param {Target} targetID - the target to clear the pen layer for.
     */
    destroyPenLayerForID (targetID) {
        const penState = this._penStates[targetID];
        if (penState) {
            const target = this.runtime.getTargetById(targetID);
            if (target && target.isOriginal) {
                this.runtime.renderer.destroyDrawable(penState.drawableID, StageLayering.PEN_LAYER);
                this.runtime.renderer.destroySkin(penState.skinID);
            }
            delete this._penStates[targetID];
            this.runtime.requestRedraw();
        }
    }

    /**
     * Handle a target which is exiting.
     * @param {RenderedTarget} target - the target.
     * @private
     */
    onTargetWillExit (target) {
        const penState = this._penStateFor(target);
        if (penState) {
            this.penUp({}, {target});
            this.destroyPenLayerForID(target.id);
        }
    }

    onRuntimeDisposed () {
        Object.keys(this._penStates).forEach(targetID => {
            this.destroyPenLayerForID(targetID);
        });
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
            const sourcePenState = this._penStateFor(sourceTarget);
            if (sourcePenState) {
                const newPenState = VPenBlocks.DEFAULT_PEN_STATE;
                newPenState.skinID = sourcePenState.skinID;
                newPenState.drawableID = sourcePenState.drawableID;
                newPenState.penType = sourcePenState.penType;
                newPenState.penAttributes = Clone.simple(sourcePenState.penAttributes);
                this._penStates[newTarget.id] = newPenState;
                newPenState.drawing = sourcePenState.drawing.group();
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
        if (penState.penType === VPenBlocks.PEN_TYPES.TRAIL) {
            if (isForce) {
            // Only move the pen if the movement isn't forced (ie. dragged).
            // This prevents the pen from drawing when the sprite is dragged.
                this._startPenPath(target);
                this._updatePenSkinFor(target);
                return;
            }
        }
        if (penState.penType === VPenBlocks.PEN_TYPES.PLOTTER) {
            this._removeReferenceLine(penState);
        }
        penState.referencePoint = {x: target.x, y: target.y};
        if (penState.penAttributes.lineShape === VPenBlocks.LINE_SHAPES.CURVE) {
            this._addCurveToPenPath(penPath, target.x, target.y);
        } else {
            this._addLineToPenPath(penPath, target.x, target.y);
        }
        this._updatePenSkinFor(target);
    }

    /**
     * Plot a node of the path.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    plot (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        if (penState.penPath) {
            if (penState.penType === VPenBlocks.PEN_TYPES.TRAIL) {
                // Trail pen was down, so nothing to plot.
                return;
            }
        } else {
            // If there's no line started, start plotter.
            penState.penType = VPenBlocks.PEN_TYPES.PLOTTER;
            this._startPenPath(target);
            this._updatePenSkinFor(target);
            target.addListener(RenderedTarget.EVENT_TARGET_MOVED, this.onTargetMoved);
        }
        // Change the reference point to the drawing position.
        penState.referencePoint = null;
    }

    /**
     * The pen "pen down" block causes the target to leave pen trails on future motion.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    penDown (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        if (penState.penPath) {
            if (penState.penType === args.PEN_TYPE) {
                // If there's already a same type line started, nothing to do.
                return;
            }
            this.penUp(args, util);
        }
        penState.penType = args.PEN_TYPE;
        if (penState.penType === VPenBlocks.PEN_TYPES.TRAIL) {
            this._startPenPath(target);
        }
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
        if (!penState || !penState.penPath) {
            // If there's no line started, there's nothing to end.
            return;
        }
        this._finishPen(penState);
        this._updatePenSkinFor(target);
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
        const opacity = 1 - ((rgba.a ? rgba.a : 0) / 255);
        if (penState.penAttributes.color3b.r === rgba.r &&
            penState.penAttributes.color3b.g === rgba.g &&
            penState.penAttributes.color3b.b === rgba.b &&
            penState.penAttributes.opacity === opacity) {
            // No change.
            return;
        }
        penState.penAttributes.color3b = {
            r: rgba.r,
            g: rgba.g,
            b: rgba.b
        };
        penState.penAttributes.opacity = opacity;
        const penPath = penState.penPath;
        if (penPath) {
            // If there's a pen line started, end it and start a new one.
            this._startPenPath(target);
        }
    }

    /**
     * Set the pen opacity.
     * @param {object} args - the block arguments.
     * @param {number} args.OPACITY - the opacity of the pen.
     * @param {object} util - utility object provided by the runtime.
     */
    setPenOpacity (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const newOpacity = Math.max(0, Math.min(1, Cast.toNumber(args.OPACITY) / 100));
        if (penState.penAttributes.opacity === newOpacity) {
            // No change.
            return;
        }
        penState.penAttributes.opacity = newOpacity;
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
     * Set the line shape.
     * @param {object} args - the block arguments.
     * @param {string} args.LINE_SHAPE - the shape of the line.
     * @param {object} util - utility object provided by the runtime.
     */
    setLineShape (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const newLineShape = args.LINE_SHAPE;
        if (penState.penAttributes.lineShape === newLineShape) {
            // No change.
            return;
        }
        penState.penAttributes.lineShape = newLineShape;
    }

    /**
     * Set fill color of the pen by color tool.
     * @param {object} args - the block arguments.
     * @param {string|number} args.COLOR - the color to set.
     * @param {object} util - utility object provided by the runtime.
     */
    setFillColorToColor (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const rgba = Cast.toRgbColorObject(args.COLOR);
        const opacity = 1 - ((rgba.a ? rgba.a : 0) / 255);
        if (penState.penAttributes.fillColor3b.r === rgba.r &&
            penState.penAttributes.fillColor3b.g === rgba.g &&
            penState.penAttributes.fillColor3b.b === rgba.b &&
            penState.penAttributes.fillOpacity === opacity) {
            // No change.
            return;
        }
        penState.penAttributes.fillColor3b = {
            r: rgba.r,
            g: rgba.g,
            b: rgba.b
        };
        penState.penAttributes.fillOpacity = opacity;
        const penPath = penState.penPath;
        if (penPath) {
            penPath.fill(penState.penAttributes.fillOpacity > 0 ? {
                color: penState.penAttributes.fillColor3b,
                opacity: penState.penAttributes.fillOpacity
            } : 'none');
            this._updatePenSkinFor(target);
        }
    }

    /**
     * Set fill opacity of the pen.
     * @param {object} args - the block arguments.
     * @param {number} args.OPACITY - the opacity of the fill color.
     * @param {object} util - utility object provided by the runtime.
     */
    setFillOpacity (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const newOpacity = Math.max(0, Math.min(1, Cast.toNumber(args.OPACITY) / 100));
        if (penState.penAttributes.fillOpacity === newOpacity) {
            // No change.
            return;
        }
        penState.penAttributes.fillOpacity = newOpacity;
        const penPath = penState.penPath;
        if (penPath) {
            penPath.fill(penState.penAttributes.fillOpacity > 0 ? {
                color: penState.penAttributes.fillColor3b,
                opacity: penState.penAttributes.fillOpacity
            } : 'none');
            this._updatePenSkinFor(target);
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

        // Get the actual stage size from the renderer.
        const canvasWidth = this.runtime.renderer.canvas.width;
        const canvasHeight = this.runtime.renderer.canvas.height;
        const stageResolution = 2;
        const stageSizeRatio = [
            this.stageWidth * stageResolution / canvasWidth,
            this.stageHeight * stageResolution / canvasHeight
        ];

        // Get the costume and its resolution.
        const costume = target.sprite.costumes[target.currentCostume];
        const resolution = costume.bitmapResolution || 1; // Default to 1 if resolution isn't specified

        // Stamp the drawable onto the pen layer
        const stamp = drawing.image(drawableURL);

        // Adjust position and size for stage size change
        const adjustedX = drawableData.x * stageSizeRatio[0];
        const adjustedY = drawableData.y * stageSizeRatio[1];
        const adjustedWidth = drawableData.width * stageSizeRatio[0] / resolution;
        const adjustedHeight = drawableData.height * stageSizeRatio[1] / resolution;

        stamp.move(adjustedX, adjustedY);
        stamp.size(adjustedWidth, adjustedHeight);
        stamp.opacity((100 - target.effects.ghost) / 100);
        this._updatePenSkinFor(target);
    }

    /**
     * Move drawing to the front layer.
     * @param {number} drawableID - the drawable to move.
     */
    _moveLayerToFront (drawableID) {
        // RenderWebGL.setDrawableOrder() has a bug which breaks the order of groups when moving drawable up.
        // So we move the drawable up under the sprite layer.
        const renderer = this.runtime.renderer;
        const topOrder = renderer._layerGroups[StageLayering.SPRITE_LAYER].drawListOffset - 1;
        renderer.setDrawableOrder(drawableID, topOrder, StageLayering.PEN_LAYER, false);
    }

    /**
     * Move drawing to the back layer.
     * @param {number} drawableID - the drawable to move.
     */
    _moveLayerToBack (drawableID) {
        this.runtime.renderer.setDrawableOrder(drawableID, -Infinity, StageLayering.PEN_LAYER, false);
    }

    /**
     * Move drawing forward a number of layers.
     * @param {number} drawableID - the drawable to move.
     * @param {number} nLayers How many layers to go forward.
     */
    _moveLayerUp (drawableID, nLayers) {
        // RenderWebGL.setDrawableOrder() has a bug which breaks the order of groups when moving drawable up.
        // So we move the drawable up under the sprite layer.
        const renderer = this.runtime.renderer;
        const drawableOrder = renderer.getDrawableOrder(drawableID);
        const topOrder = renderer._layerGroups[StageLayering.SPRITE_LAYER].drawListOffset - 1;
        nLayers = Math.min(nLayers, topOrder - drawableOrder);
        renderer.setDrawableOrder(drawableID, nLayers, StageLayering.PEN_LAYER, true);
    }

    /**
     * Move drawing backward a number of layers.
     * @param {number} drawableID - the drawable to move.
     * @param {number} nLayers How many layers to go backward.
     */
    _moveLayerDown (drawableID, nLayers) {
        this._moveLayerUp(drawableID, -nLayers);
    }

    /**
     * Change the layer of the drawing.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     * @param {string} args.LAYER - the layer name to change to.
     */
    changeLayerTo (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const layer = args.LAYER;
        if (layer === VPenBlocks.CHANGE_LAYER.TOP) {
            this._moveLayerToFront(penState.drawableID);
        } else if (layer === VPenBlocks.CHANGE_LAYER.BOTTOM) {
            this._moveLayerToBack(penState.drawableID);
        }
        this.runtime.requestRedraw();
    }

    /**
     * Move the drawing a number of layers.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     * @param {number} args.LAYERS - the number of layers to move.
     * @param {string} args.DIRECTION - the direction to move.
     */
    moveLayerBy (args, util) {
        const target = util.target;
        const penState = this._getPenState(target);
        const layerCount = Cast.toNumber(args.LAYERS);
        if (args.DIRECTION === VPenBlocks.MOVE_LAYER.UP) {
            this._moveLayerUp(penState.drawableID, layerCount);
        } else if (args.DIRECTION === VPenBlocks.MOVE_LAYER.DOWN) {
            this._moveLayerDown(penState.drawableID, layerCount);
        }
        this.runtime.requestRedraw();
    }

    /**
     * Get the order of the drawing in the all drawable.
     * @param {object} target - the target to get the order for.
     * @returns {number} - the order of the drawing.
     */
    _getDrawableOrderFor (target) {
        const penState = this._penStates[target.id];
        if (!penState) {
            return -1;
        }
        const renderer = this.runtime.renderer;
        return renderer.getDrawableOrder(penState.drawableID);
    }

    /**
     * Clears the pen layer's contents.
     */
    clearAll () {
        this.runtime.targets.forEach(target => {
            this._clearForTarget(target);
        });
    }

    /**
     * Save the drawing as an SVG file.
     * @param {SVG} svg - the SVG drawing.
     * @param {string} fileName - the name of the file to save.
     * @returns {Promise} - a promise that resolves after the file has been saved.
     */
    _saveSVGAsFile (svg, fileName) {
        const saveData = svg
            .size(
                `${this.stageWidth / this.stepPerMM}mm`,
                `${this.stageHeight / this.stepPerMM}mm`
            )
            .svg();
        const blob = new Blob([saveData], {type: 'application/octet-stream'});
        return FileSaver.saveAs(blob, `${fileName}.svg`);
    }

    /**
     * Add the sprite drawing group to the SVG if the sprite has a drawing.
     * @param {Target} target - the target to add the sprite drawing for.
     * @param {Container} svgContainer - the SVG container to add the sprite drawing to.
     * @returns {Container?} - a new group for the sprite drawing or null.
     */
    _addSpriteDrawingTo (target, svgContainer) {
        const penState = this._penStateFor(target);
        if (!penState || !penState.drawing) {
            return null;
        }
        const drawings = penState.drawing.children();
        if (drawings.length === 0) {
            return null;
        }
        const spriteGroup = svgContainer.group();
        spriteGroup.id(target.sprite.name);
        drawings.forEach(child => {
            spriteGroup.add(child.clone());
        });
        return spriteGroup;
    }

    /**
     * Save the sprite drawing as an SVG file.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     * @returns {string} - the result of saving the sprite drawing.
     */
    downloadSpriteDrawing (args, util) {
        const target = util.target;
        const penState = this._penStateFor(target);
        if (!penState || !penState.drawing) {
            return 'no drawing';
        }
        // eslint-disable-next-line no-alert
        const fileName = prompt(
            formatMessage({
                id: 'xcxVPen.fileNameForSprite',
                default: 'Enter a name for the file:',
                description: 'prompt for the file name to save the sprite drawing'
            }),
            target.sprite.name
        );
        if (fileName === null || fileName === '') {
            return 'cancelled';
        }
        const saveSVG = this._createDrawingSVG();
        this._addSpriteDrawingTo(target, saveSVG);
        this._saveSVGAsFile(saveSVG, fileName);
        return 'saved';
    }

    /**
     * Save the SVG drawing.
     * @param {object} args - the block arguments.
     * @param {string} args.NAME - the name of the file to save.
     * @param {object} util - utility object provided by the runtime.
     * @returns {string} - the result of saving the SVG drawing.
     */
    downloadAllDrawing (args, util) {
        // eslint-disable-next-line no-alert
        const fileName = prompt(
            formatMessage({
                id: 'xcxVPen.fileNameForAll',
                default: 'Enter a name for the file:',
                description: 'prompt for the file name to save the all drawing'
            }),
            'vpen'
        );
        if (fileName === null || fileName === '') {
            return 'cancelled';
        }
        const saveSVG = this._createDrawingSVG();
        util.runtime.targets
            .filter(target => target.isSprite())
            .sort((a, b) => this._getDrawableOrderFor(a) - this._getDrawableOrderFor(b))
            .forEach(target => {
                this._addSpriteDrawingTo(target, saveSVG);
            });
        this._saveSVGAsFile(saveSVG, fileName);
        return 'saved';
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
                    opcode: 'clearAll',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.clearAll',
                        default: 'erase all drawings',
                        description: 'erase all pen trails and stamps'
                    })
                },
                {
                    opcode: 'clear',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.clear',
                        default: 'erase drawings of this sprite',
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
                            menu: 'penTypesMenu'
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
                        description: 'set the pen color'
                    }),
                    arguments: {
                        COLOR: {
                            type: ArgumentType.COLOR
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setPenOpacity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.setPenOpacity',
                        default: 'set pen opacity to [OPACITY]',
                        description: 'set the vpen opacity'
                    }),
                    arguments: {
                        OPACITY: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
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
                {
                    opcode: 'setLineShape',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.setLineShape',
                        default: 'set line shape to [LINE_SHAPE]',
                        description: 'set the shape of a line'
                    }),
                    arguments: {
                        LINE_SHAPE: {
                            type: ArgumentType.STRING,
                            menu: 'lineShapesMenu'
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setFillColorToColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.setFillColorToColor',
                        default: 'set fill color to [COLOR]',
                        description: 'set fill color of the pen'
                    }),
                    arguments: {
                        COLOR: {
                            type: ArgumentType.COLOR
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setFillOpacity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.setFillOpacity',
                        default: 'set fill opacity to [OPACITY]',
                        description: 'set fill opacity of the pen'
                    }),
                    arguments: {
                        OPACITY: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'changeLayerTo',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.changeLayerTo',
                        default: 'change layer to [LAYER]',
                        description: 'change the layer of the pen'
                    }),
                    arguments: {
                        LAYER: {
                            type: ArgumentType.STRING,
                            menu: 'changeLayerMenu'
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'moveLayerBy',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.moveLayerBy',
                        default: 'move [DIRECTION] [LAYERS] layers',
                        description: 'move the layer of the pen'
                    }),
                    arguments: {
                        DIRECTION: {
                            type: ArgumentType.STRING,
                            menu: 'moveLayerDirectionMenu'
                        },
                        LAYERS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
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
                    }
                },
                {
                    opcode: 'downloadAllDrawing',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.downloadAllDrawing',
                        default: 'download all drawings',
                        description: 'download the SVG of all sprites'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'downloadSpriteDrawing',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxVPen.downloadSpriteDrawing',
                        default: 'download drawing by the sprite',
                        description: 'download SVG of the sprite'
                    }),
                    arguments: {
                    },
                    filter: [TargetType.SPRITE]
                }
            ],
            menus: {
                penTypesMenu: {
                    acceptReporters: false,
                    items: 'getPenTypesMenuItems'
                },
                lineShapesMenu: {
                    acceptReporters: false,
                    items: 'getLineShapesMenuItems'
                },
                changeLayerMenu: {
                    acceptReporters: false,
                    items: 'getChangeLayerMenuItems'
                },
                moveLayerDirectionMenu: {
                    acceptReporters: false,
                    items: 'getMoveLayerDirectionMenuItems'
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

    getLineShapesMenuItems () {
        return [
            {
                text: formatMessage({
                    id: 'xcxVPen.lineShapesMenu.straight',
                    default: 'straight',
                    description: 'line shape'
                }),
                value: VPenBlocks.LINE_SHAPES.STRAIGHT
            },
            {
                text: formatMessage({
                    id: 'xcxVPen.lineShapesMenu.curve',
                    default: 'curve',
                    description: 'curve line shape'
                }),
                value: VPenBlocks.LINE_SHAPES.CURVE
            }
        ];
    }

    getChangeLayerMenuItems () {
        return [
            {
                text: formatMessage({
                    id: 'xcxVPen.changeLayerMenu.top',
                    default: 'top',
                    description: 'change pen layer to top'
                }),
                value: VPenBlocks.CHANGE_LAYER.TOP
            },
            {
                text: formatMessage({
                    id: 'xcxVPen.changeLayerMenu.bottom',
                    default: 'bottom',
                    description: 'change pen layer to bottom'
                }),
                value: VPenBlocks.CHANGE_LAYER.BOTTOM
            }
        ];
    }

    getMoveLayerDirectionMenuItems () {
        return [
            {
                text: formatMessage({
                    id: 'xcxVPen.moveLayerDirectionMenu.up',
                    default: 'up',
                    description: 'move pen layer up'
                }),
                value: VPenBlocks.MOVE_LAYER.UP
            },
            {
                text: formatMessage({
                    id: 'xcxVPen.moveLayerDirectionMenu.down',
                    default: 'down',
                    description: 'move pen layer down'
                }),
                value: VPenBlocks.MOVE_LAYER.DOWN
            }
        ];
    }
}

export {VPenBlocks as default, VPenBlocks as blockClass};
