import { VPenBlocks, blockClass } from "../src/vm/extensions/block/index.js";

describe("VPenBlocks Drawing Performance", () => {
    let block;
    let runtime;
    let target;

    beforeEach(() => {
        target = {
            id: 'testTarget',
            x: 0,
            y: 0,
            size: 100,
            direction: 90,
            rotationStyle: 'all around',
            currentCostume: 0,
            sprite: {
                costumes: [{ skinId: 10 }],
                name: 'Sprite1'
            },
            effects: { ghost: 0 },
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
                updateDrawableEffect: jest.fn(),
                updateDrawableDirectionScale: jest.fn(),
                updateDrawableVisible: jest.fn(),
                updateDrawablePosition: jest.fn(),
                extractDrawableScreenSpace: jest.fn().mockReturnValue({
                    imageData: { width: 10, height: 10, data: new Uint8ClampedArray(400) },
                    width: 10,
                    height: 10,
                    x: 0,
                    y: 0
                }),
                destroyDrawable: jest.fn(),
                updateSVGSkin: jest.fn(),
                requestRedraw: jest.fn(),
                canvas: {
                    clientWidth: 480,
                    clientHeight: 360
                }
            },
            on: () => {},
            getTargetById: () => target,
            requestRedraw: jest.fn(),
            targets: [target]
        };
        
        // Mock document.createElement for canvas
        const originalCreateElement = document.createElement.bind(document);
        jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext: jest.fn().mockReturnValue({
                        putImageData: jest.fn(),
                    }),
                    toDataURL: jest.fn().mockReturnValue('data:image/png;base64,mock')
                };
            }
            return originalCreateElement(tagName);
        });

        // Mock requestAnimationFrame
        global.requestAnimationFrame = (callback) => {
            return setTimeout(callback, 0);
        };
        global.cancelAnimationFrame = (id) => {
            clearTimeout(id);
        };

        block = new blockClass(runtime);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("benchmark drawing and clear loop", () => {
        const iterations = 1000;
        const start = performance.now();
        
        // Setup pen down
        block.penDown({ PEN_TYPE: 'trail' }, { target });

        for (let i = 0; i < iterations; i++) {
            // Simulate movement drawing
            block.onTargetMoved(target, 0, 0, false);
            
            // Check SVG size occasionally
            if (i % 100 === 0) {
                const penState = block._penStateFor(target);
                if (penState && penState.drawing) {
                    console.log(`Iteration ${i}: SVG length = ${penState.drawing.svg().length}`);
                }
            }

            // Clear
            block.clear({}, { target });
        }
        
        const end = performance.now();
        const duration = end - start;
        console.log(`[Benchmark] ${iterations} iterations of draw/clear took ${duration.toFixed(2)}ms`);
        
        expect(duration).toBeGreaterThan(0);
    });
});
