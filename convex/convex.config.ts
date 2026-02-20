import ltcgCards from "@lunchtable/cards/convex.config";
import ltcgGuilds from "@lunchtable/guilds/convex.config";
import ltcgMatch from "@lunchtable/match/convex.config";
import ltcgStory from "@lunchtable/story/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(ltcgCards);
app.use(ltcgGuilds);
app.use(ltcgMatch);
app.use(ltcgStory);

export default app;
