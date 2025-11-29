import { VPenBlocks, blockClass } from "../src/vm/extensions/block/index.js";

describe("VPenBlocks", () => {
    let block;

    beforeEach(() => {
        const runtime = {
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
                getNativeSize: () => [480, 360]
            },
            on: () => {}
        };
        block = new blockClass(runtime);
    });

    it("should have an id and a name", () => {
        const info = block.getInfo();
        expect(info.id).toBe('xcxVPen');
        expect(info.name).toBe('Vector Pen');
    });
});
