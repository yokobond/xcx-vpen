import { VPenBlocks, blockClass } from "../src/vm/extensions/block/index.js";

describe("VPenBlocks", () => {
    let block;
    let runtime;
    let target;

    beforeEach(() => {
        target = {
            id: 'testTarget',
            x: 0,
            y: 0,
            addListener: jest.fn(),
            removeListener: jest.fn()
        };
        runtime = {
            formatMessage: Object.assign(
                msg => msg.default,
                {
                    setup: () => ({
                        translations: {
                            'en': {}
                        },
                        locale: 'en'
                    })
                }
            ),
            renderer: {
                getNativeSize: () => [480, 360],
                createSVGSkin: jest.fn().mockReturnValue(1),
                createDrawable: jest.fn().mockReturnValue(2),
                updateDrawableSkinId: jest.fn(),
                updateSVGSkin: jest.fn(),
                requestRedraw: jest.fn()
            },
            on: () => {},
            getTargetById: () => target,
            requestRedraw: jest.fn()
        };
        block = new blockClass(runtime);
    });

    it("should have an id and a name", () => {
        const info = block.getInfo();
        expect(info.id).toBe('xcxVPen');
        expect(info.name).toBe('Vector Pen');
    });

    it("should set and get stepPerMM", () => {
        block.setStepPerMM({ STEP_PER_MM: 10 });
        expect(block.getStepPerMM()).toBe(10);
    });

    describe('pen up/down', () => {
        it('should add a listener when pen is down', () => {
            block.penDown({ PEN_TYPE: 'trail' }, { target });
            expect(target.addListener).toHaveBeenCalledWith(
                'TARGET_MOVED',
                block.onTargetMoved
            );
        });

        it('should remove the listener when pen is up', () => {
            // First, pen down to create the path and add the listener
            block.penDown({ PEN_TYPE: 'trail' }, { target });
            // Then, pen up
            block.penUp({}, { target });
            expect(target.removeListener).toHaveBeenCalledWith(
                'TARGET_MOVED',
                block.onTargetMoved
            );
        });
    });

    describe('pen attributes', () => {
        it('should set pen size', () => {
            block.setPenSizeTo({ SIZE: 5 }, { target });
            const penState = block._getPenState(target);
            expect(penState.penAttributes.diameter).toBe(5);
        });

        it('should set line shape', () => {
            const VPenBlocks = block.constructor;
            block.setLineShape({ LINE_SHAPE: VPenBlocks.LINE_SHAPES.CURVE }, { target });
            const penState = block._getPenState(target);
            expect(penState.penAttributes.lineShape).toBe(VPenBlocks.LINE_SHAPES.CURVE);
        });
    });
});
