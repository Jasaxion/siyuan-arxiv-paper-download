declare module "turndown-plugin-gfm" {
    import TurndownService from "turndown";

    type TurndownPlugin = (turndownService: TurndownService) => void;

    export const gfm: TurndownPlugin;
    export const tables: TurndownPlugin;
    export const strikethrough: TurndownPlugin;
}
