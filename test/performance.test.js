import { VPenBlocks, blockClass } from "../src/vm/extensions/block/index.js";

describe("VPenBlocks Performance", () => {
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

        block = new blockClass(runtime);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("benchmark stamp and clear loop", () => {
        const iterations = 1000;
        const start = performance.now();
        
        for (let i = 0; i < iterations; i++) {
            block.stamp({}, { target });
            block.clear({}, { target });
        }
        
        const end = performance.now();
        const duration = end - start;
        console.log(`[Benchmark] ${iterations} iterations of stamp/clear took ${duration.toFixed(2)}ms`);
        
        // Basic assertion to ensure it runs
        expect(duration).toBeGreaterThan(0);
    });
});
