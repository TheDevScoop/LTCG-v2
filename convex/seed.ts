import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { LTCGCards } from "@lunchtable/cards";
import { LTCGStory } from "@lunchtable/story";
import { CARD_DEFINITIONS, STARTER_DECKS } from "./cardData";

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);
const story = new LTCGStory(components.lunchtable_tcg_story as any);

export const seedAll = mutation({
  args: {},
  returns: v.object({
    cards: v.any(),
    decks: v.any(),
    chapters: v.number(),
    stages: v.number(),
  }),
  handler: async (ctx) => {
    // Seed all 132 card definitions
    const cardResult = await cards.seeds.seedCardDefinitions(
      ctx,
      [...CARD_DEFINITIONS] as any[],
    );

    // Seed 6 starter decks
    const deckResult = await cards.seeds.seedStarterDecks(ctx, STARTER_DECKS);

    // Seed all 16 story chapters
    const chaptersCount = await story.seeds.seedChapters(ctx, CHAPTERS);

    // Get all published chapters back to map IDs for stages
    const allChapters = await story.chapters.getChapters(ctx, {
      status: "published",
    });

    let totalStages = 0;
    for (const ch of allChapters ?? []) {
      const key = `${ch.actNumber}-${ch.chapterNumber}`;
      const stagesFn = STAGE_DATA[key];
      if (stagesFn) {
        totalStages += await story.seeds.seedStages(ctx, stagesFn(ch._id));
      }
    }

    // Seed 6 cliques (one per archetype)
    const cliques = await ctx.db.query("cliques").first();
    if (!cliques) {
      await ctx.db.insert("cliques", { name: "Dropout Gang", archetype: "dropouts", description: "High-risk, high-reward chaos. Live fast, break things.", memberCount: 0, totalWins: 0, createdAt: Date.now() });
      await ctx.db.insert("cliques", { name: "Honor Club", archetype: "preps", description: "Status and social warfare. Always be closing.", memberCount: 0, totalWins: 0, createdAt: Date.now() });
      await ctx.db.insert("cliques", { name: "Geek Squad", archetype: "geeks", description: "Card draw and tech control. Outsmart the opposition.", memberCount: 0, totalWins: 0, createdAt: Date.now() });
      await ctx.db.insert("cliques", { name: "Freak Show", archetype: "freaks", description: "Disruption and chaos. Make things weird.", memberCount: 0, totalWins: 0, createdAt: Date.now() });
      await ctx.db.insert("cliques", { name: "Nerd Herd", archetype: "nerds", description: "Defensive control. The best defense is a good offense.", memberCount: 0, totalWins: 0, createdAt: Date.now() });
      await ctx.db.insert("cliques", { name: "Goodie Two-Shoes", archetype: "goodies", description: "Attrition and grind. Never give an inch.", memberCount: 0, totalWins: 0, createdAt: Date.now() });
    }

    return {
      cards: cardResult,
      decks: deckResult,
      chapters: chaptersCount,
      stages: totalStages,
    };
  },
});

// ── Story Data ────────────────────────────────────────────────────────
// 16 chapters across 4 acts, ordered by act then chapter number.
// Each chapter maps to 3 stages via the STAGE_DATA record below.

const CHAPTERS = [
  // ═══════════════════════════════════════════════════════════════════
  // ACT 1 — FRESHMAN
  // ═══════════════════════════════════════════════════════════════════
  {
    actNumber: 1,
    chapterNumber: 1,
    title: "Seating Chart Posted",
    description:
      "The cafeteria reorganizes. Identity is assigned before chosen.",
    storyText:
      "A laminated sheet appears on the wall. Names sorted into tables. Nobody asked you where you wanted to sit.",
    loreText:
      "The Lunch Table hierarchy has existed since the school was built. The chart just makes it official.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: {},
    baseRewards: { gold: 50, xp: 25 },
  },
  {
    actNumber: 1,
    chapterNumber: 2,
    title: "Tryouts & Auditions",
    description:
      "Everyone competes to define themselves. Vice_On_Loss+1.",
    storyText:
      "Sports, drama, debate — every club is a cage match for identity. Lose and the vice sticks.",
    loreText:
      "They call it 'finding yourself.' Really it's letting the cafeteria decide what you are.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 50, xp: 25 },
  },
  {
    actNumber: 1,
    chapterNumber: 3,
    title: "Parking Lot Kickback",
    description:
      "The first party cracks the illusion. Vice types unlock.",
    storyText:
      "Someone's older sibling bought cases. The parking lot is louder than the gym. This is where masks slip.",
    loreText:
      "Every vice has a debut. The parking lot is where they all premiere.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 50, xp: 25 },
  },
  {
    actNumber: 1,
    chapterNumber: 4,
    title: "Screenshots Circulating",
    description:
      "Rumors spiral through group chats. Trap_Cost-1, Random_Target_Trap_Amplify.",
    storyText:
      "Someone screenshotted something. Doesn't matter what — it's already in every group chat.",
    loreText:
      "Information is currency. Screenshots are weapons. Welcome to digital warfare.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 50, xp: 25 },
  },

  // ═══════════════════════════════════════════════════════════════════
  // ACT 2 — SOPHOMORE
  // ═══════════════════════════════════════════════════════════════════
  {
    actNumber: 2,
    chapterNumber: 1,
    title: "Table Realignment",
    description:
      "Seating reshuffles. Deja vu spreads. Forced_Deck_Swap_1_Card.",
    storyText:
      "New semester, new chart. Faces you forgot sit across from you. Something feels recycled.",
    loreText:
      "The tables shift but the hierarchy stays. You just traded one cage for another.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true, minimumLevel: 2 },
    baseRewards: { gold: 75, xp: 35 },
  },
  {
    actNumber: 2,
    chapterNumber: 2,
    title: "Performance Review",
    description:
      "Midterms apply pressure. All_Stability-200, Stress_Amplifier.",
    storyText:
      "Grades posted publicly. Everyone's stability takes a hit. The pressure cooker is on.",
    loreText:
      "They measure you in numbers. The numbers measure your breaking point.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 75, xp: 35 },
  },
  {
    actNumber: 2,
    chapterNumber: 3,
    title: "Homecoming Peak",
    description:
      "Popularity surges before collapse. Reputation_Gain_Double.",
    storyText:
      "The gym is draped in streamers. Crowns are given. For one night, reputation is everything.",
    loreText:
      "Homecoming is the peak of the illusion. After the crown, only the fall remains.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 75, xp: 35 },
  },
  {
    actNumber: 2,
    chapterNumber: 4,
    title: "Hall Monitors Watching",
    description:
      "Authority senses instability. Trap_Cost-2, Control_Week.",
    storyText:
      "Clipboards and hall passes. They're watching closer now. Someone reported something.",
    loreText:
      "When the system feels threatened, it sends its enforcers. The monitors have always been here.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 75, xp: 35 },
  },

  // ═══════════════════════════════════════════════════════════════════
  // ACT 3 — JUNIOR
  // ═══════════════════════════════════════════════════════════════════
  {
    actNumber: 3,
    chapterNumber: 1,
    title: "Standardized Evaluation",
    description:
      "The system measures everyone. Forced_Minor_Breakdowns.",
    storyText:
      "Fill in the bubbles. The machine reads your worth. Some bubbles don't have right answers.",
    loreText:
      "Standardized testing: the school's way of telling you exactly how replaceable you are.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true, minimumLevel: 3 },
    baseRewards: { gold: 100, xp: 50 },
  },
  {
    actNumber: 3,
    chapterNumber: 2,
    title: "Senior Party Early",
    description:
      "Time accelerates unnaturally. All_Vice_Active.",
    storyText:
      "You weren't invited but you're here. Seniors move like they're already gone. All vices are live.",
    loreText:
      "The senior party is a time machine. You see your future and it's already falling apart.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 100, xp: 50 },
  },
  {
    actNumber: 3,
    chapterNumber: 3,
    title: "Expulsion Event",
    description:
      "Someone vanishes from the cafeteria. Highest_Vice_Destroyed.",
    storyText:
      "An empty chair. A locker cleaned out. Nobody talks about it but everyone noticed.",
    loreText:
      "The cafeteria consumes its own. The highest vice gets you erased.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 100, xp: 50 },
  },
  {
    actNumber: 3,
    chapterNumber: 4,
    title: "The Bell Doesn't Ring",
    description:
      "Reality glitches. Card_Text_Shuffle, Random everything.",
    storyText:
      "Third period never ended. The clock is wrong. Cards read differently than you remember.",
    loreText:
      "When the bell stops ringing, the school reveals what it actually is.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 100, xp: 50 },
  },

  // ═══════════════════════════════════════════════════════════════════
  // ACT 4 — SENIOR
  // ═══════════════════════════════════════════════════════════════════
  {
    actNumber: 4,
    chapterNumber: 1,
    title: "Future Planning",
    description:
      "Escape seems possible. Player_Select_Path, Path_Lock_Selected.",
    storyText:
      "College brochures. Trade school pamphlets. The guidance counselor smiles too wide. Pick your cage.",
    loreText:
      "They give you the illusion of choice. Every path leads back to the cafeteria.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true, minimumLevel: 4 },
    baseRewards: { gold: 150, xp: 75 },
  },
  {
    actNumber: 4,
    chapterNumber: 2,
    title: "Final Rankings",
    description:
      "The system rewards dominance. Leaderboard_Modifier, Low_Stability_UI_Crack.",
    storyText:
      "Class rank posted. Valedictorian crowned. The leaderboard is the last weapon the school has.",
    loreText:
      "Rankings are the school's final verdict. Your number follows you out the door.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 150, xp: 75 },
  },
  {
    actNumber: 4,
    chapterNumber: 3,
    title: "Graduation Rehearsal",
    description:
      "The exit doors appear. No_New_Vice, Vice_Effects_Double, Tension_Amplified.",
    storyText:
      "Walk single file. Don't trip. The doors are right there. Why does it feel like a trap?",
    loreText:
      "Rehearsal is practice for leaving. But leaving means admitting what you became.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 150, xp: 75 },
  },
  {
    actNumber: 4,
    chapterNumber: 4,
    title: "Graduation Day",
    description:
      "Face yourself or repeat forever. Final_Self_Duel.",
    storyText:
      "The cafeteria is empty. One chair left. Across from it sits someone wearing your face.",
    loreText:
      "There is no diploma. There is no ceremony. There is only you and what the cafeteria made you.",
    archetype: "mixed",
    battleCount: 3,
    status: "published" as const,
    isActive: true,
    unlockRequirements: { previousChapter: true },
    baseRewards: { gold: 150, xp: 75 },
  },
];

// ── Stage Data ────────────────────────────────────────────────────────
// Maps "actNumber-chapterNumber" to a factory function returning 3 stages.
// Each stage has escalating difficulty, reward scaling, and dialogue.

type StageFactory = (chapterId: string) => Array<{
  chapterId: string;
  stageNumber: number;
  name: string;
  description: string;
  opponentName: string;
  difficulty: "easy" | "medium" | "hard" | "boss";
  aiDifficulty: "easy" | "medium" | "hard" | "boss";
  preMatchDialogue: Array<{ speaker: string; text: string }>;
  postMatchWinDialogue: Array<{ speaker: string; text: string }>;
  postMatchLoseDialogue: Array<{ speaker: string; text: string }>;
  rewardGold: number;
  rewardXp: number;
  firstClearBonus: number;
  status: "published";
}>;

const STAGE_DATA: Record<string, StageFactory> = {
  // ═══════════════════════════════════════════════════════════════════
  // ACT 1 — FRESHMAN
  // ═══════════════════════════════════════════════════════════════════

  // Chapter 1-1: Seating Chart Posted
  "1-1": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Find Your Seat",
      description: "The chart says you sit here. Prove you belong.",
      opponentName: "New Kid",
      difficulty: "easy",
      aiDifficulty: "easy",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Fresh meat. The chart put you at this table. Don't get comfortable." },
        { speaker: "New Kid", text: "I didn't pick this seat either. Guess we settle it the old way." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You held your seat. For now." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Can't even hold a seat on day one. Pathetic." },
      ],
      rewardGold: 30,
      rewardXp: 15,
      firstClearBonus: 50,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Cafeteria Pecking Order",
      description: "The hierarchy is forming. Where do you land?",
      opponentName: "Tryout Rival",
      difficulty: "easy",
      aiDifficulty: "easy",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The strong eat first. The weak get scraps." },
        { speaker: "Tryout Rival", text: "I've been watching you. You're not as tough as the chart says." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Moving up already. Don't let it go to your head." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Tryout Rival", text: "Sit back down. That's not your table." },
      ],
      rewardGold: 40,
      rewardXp: 20,
      firstClearBonus: 75,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Table Captain Duel",
      description: "The Table Captain doesn't share power. Boss fight.",
      opponentName: "Table Captain",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The captain noticed you. That's never good." },
        { speaker: "Table Captain", text: "This is my table. My rules. My cafeteria." },
        { speaker: "milunchlady", text: "Beat the captain or eat alone forever." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "New captain at the table. The cafeteria remembers." },
        { speaker: "Table Captain", text: "...Fine. But this isn't over." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Table Captain", text: "Know your place, freshman." },
        { speaker: "milunchlady", text: "Back to the kiddie table." },
      ],
      rewardGold: 60,
      rewardXp: 30,
      firstClearBonus: 100,
      status: "published",
    },
  ],

  // Chapter 1-2: Tryouts & Auditions
  "1-2": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Sign-Up Sheet",
      description: "Clubs are recruiting. Every tryout is a battlefield.",
      opponentName: "New Kid",
      difficulty: "easy",
      aiDifficulty: "easy",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Tryouts start now. Lose and your vice counter ticks up." },
        { speaker: "New Kid", text: "I need this spot more than you do." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You made the cut. Vice stays low. For now." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Rejected. Feel that sting? That's vice creeping in." },
      ],
      rewardGold: 30,
      rewardXp: 15,
      firstClearBonus: 50,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Callback Round",
      description: "Second cuts. The pressure doubles.",
      opponentName: "Tryout Rival",
      difficulty: "easy",
      aiDifficulty: "easy",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Callbacks. Half of you get cut. All of you get scars." },
        { speaker: "Tryout Rival", text: "Only one of us walks out of here with an identity." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You defined yourself. Question is — did you choose right?" },
      ],
      postMatchLoseDialogue: [
        { speaker: "Tryout Rival", text: "Didn't make it? The cafeteria will define you instead." },
      ],
      rewardGold: 40,
      rewardXp: 20,
      firstClearBonus: 75,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Final Audition",
      description: "One spot left. Everything rides on this duel.",
      opponentName: "Parking Lot Regular",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Last spot. Last chance. Vice is watching." },
        { speaker: "Parking Lot Regular", text: "I don't need a club. I already know what I am." },
        { speaker: "milunchlady", text: "Prove you're more than what the chart says." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Identity: earned. But at what cost?" },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "No club. No identity. Vice counter +1." },
        { speaker: "Parking Lot Regular", text: "Come find me in the lot. We don't need tryouts." },
      ],
      rewardGold: 60,
      rewardXp: 30,
      firstClearBonus: 100,
      status: "published",
    },
  ],

  // Chapter 1-3: Parking Lot Kickback
  "1-3": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Tailgate",
      description: "The party spills out of someone's trunk. Vice types unlock.",
      opponentName: "Parking Lot Regular",
      difficulty: "easy",
      aiDifficulty: "easy",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Parking lot after dark. This is where masks come off." },
        { speaker: "Parking Lot Regular", text: "Out here, nobody's grading you. Just vibing." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You survived the lot. But you unlocked something you can't put back." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "The lot chewed you up. Vice is wide open now." },
      ],
      rewardGold: 30,
      rewardXp: 15,
      firstClearBonus: 50,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Bass Drop",
      description: "The speakers get louder. The illusions crack harder.",
      opponentName: "New Kid",
      difficulty: "easy",
      aiDifficulty: "easy",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Subwoofers rattling windows. Nobody hears you scream out here." },
        { speaker: "New Kid", text: "I'm different at night. We all are." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You saw through the noise. Most don't." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Lost in the bass. The vice found its rhythm." },
      ],
      rewardGold: 40,
      rewardXp: 20,
      firstClearBonus: 75,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Last One Standing",
      description: "The kickback gets ugly. Only the strong leave clean.",
      opponentName: "Rumor Miller",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Party's winding down. The lot remembers everything." },
        { speaker: "Rumor Miller", text: "I saw what you did. Everyone will know by Monday." },
        { speaker: "milunchlady", text: "Win this or the lot owns you." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Clean exit. Rare for a freshman." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Rumor Miller", text: "See you on everyone's story tomorrow." },
        { speaker: "milunchlady", text: "The screenshots are already loading." },
      ],
      rewardGold: 60,
      rewardXp: 30,
      firstClearBonus: 100,
      status: "published",
    },
  ],

  // Chapter 1-4: Screenshots Circulating
  "1-4": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Group Chat Leak",
      description: "Someone forwarded the screenshot. Trap costs are reduced.",
      opponentName: "Rumor Miller",
      difficulty: "easy",
      aiDifficulty: "easy",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The group chat lit up at 2 AM. Someone's exposed." },
        { speaker: "Rumor Miller", text: "I didn't start it. I just made sure everyone saw it." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You shut down one source. But there are always more." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "The screenshot of YOUR loss just went viral too." },
      ],
      rewardGold: 30,
      rewardXp: 15,
      firstClearBonus: 50,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Damage Control",
      description: "The rumors are spiraling. Traps amplify randomly.",
      opponentName: "Tryout Rival",
      difficulty: "easy",
      aiDifficulty: "easy",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Traps are cheap when gossip flows. Everyone's armed." },
        { speaker: "Tryout Rival", text: "Heard what they're saying about you. Want to prove them wrong?" },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Damage contained. But the internet never forgets." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Tryout Rival", text: "The screenshots write themselves at this point." },
      ],
      rewardGold: 40,
      rewardXp: 20,
      firstClearBonus: 75,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Source Traced",
      description: "Find the origin. End the chain. Traps fly everywhere.",
      opponentName: "Table Captain",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Every rumor has a patient zero. Found them." },
        { speaker: "Table Captain", text: "I control the information. I control the table." },
        { speaker: "milunchlady", text: "Traps are amplified. Watch every step." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Source eliminated. Freshman year survives. Barely." },
        { speaker: "Table Captain", text: "Delete the chat. This never happened." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Table Captain", text: "Now I have screenshots of you losing too." },
        { speaker: "milunchlady", text: "The digital graveyard grows. Welcome to sophomore year." },
      ],
      rewardGold: 60,
      rewardXp: 30,
      firstClearBonus: 100,
      status: "published",
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // ACT 2 — SOPHOMORE
  // ═══════════════════════════════════════════════════════════════════

  // Chapter 2-1: Table Realignment
  "2-1": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "New Semester Shuffle",
      description: "New chart, same game. Forced deck swap: 1 card.",
      opponentName: "Shuffled Student",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "New semester. The chart shuffled you again. Deja vu?" },
        { speaker: "Shuffled Student", text: "They moved me three tables over. I don't know anyone here." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "New table, same dominance. Adapt or die." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Can't even win at a new table. The shuffle exposed you." },
      ],
      rewardGold: 50,
      rewardXp: 25,
      firstClearBonus: 100,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Familiar Faces, Wrong Seats",
      description: "Everyone's displaced. The deck swap stings.",
      opponentName: "Stressed Scholar",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Recognize them? They don't recognize you. That's the realignment." },
        { speaker: "Stressed Scholar", text: "I had everything figured out last semester. Now it's all wrong." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You're adapting faster than they expected." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Stressed Scholar", text: "Even the smart ones can't outrun the shuffle." },
      ],
      rewardGold: 70,
      rewardXp: 35,
      firstClearBonus: 125,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Forced Reseat",
      description: "The administration enforces the new order. Resist or submit.",
      opponentName: "Hall Monitor",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The monitors are enforcing the new seating. No exceptions." },
        { speaker: "Hall Monitor", text: "Sit where you're told. The chart is law." },
        { speaker: "milunchlady", text: "Beat the system or become part of it." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You broke the realignment. The chart means nothing to you." },
        { speaker: "Hall Monitor", text: "This will be reported." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Hall Monitor", text: "Sit. Stay. Good student." },
        { speaker: "milunchlady", text: "The shuffle wins again." },
      ],
      rewardGold: 100,
      rewardXp: 50,
      firstClearBonus: 175,
      status: "published",
    },
  ],

  // Chapter 2-2: Performance Review
  "2-2": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Pop Quiz",
      description: "Unannounced test. Stability drops for everyone.",
      opponentName: "Stressed Scholar",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Pop quiz. Everyone's stability just tanked. All_Stability-200." },
        { speaker: "Stressed Scholar", text: "I studied for the wrong test. I always study for the wrong test." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Passed under pressure. Your stability held." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Failed. The stress amplifier kicks in harder now." },
      ],
      rewardGold: 50,
      rewardXp: 25,
      firstClearBonus: 100,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Midterm Crunch",
      description: "Grades posted. The pressure is visible on every face.",
      opponentName: "Shuffled Student",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Midterms posted on the board. Some numbers end careers." },
        { speaker: "Shuffled Student", text: "My parents saw the grades before I did. I'm already dead." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Above the curve. But the curve is a noose." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Below average. The system files you under 'disposable.'" },
      ],
      rewardGold: 70,
      rewardXp: 35,
      firstClearBonus: 125,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Top of the Class",
      description: "Face the highest-stability player. The boss of the semester.",
      opponentName: "The Evaluator",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The top scorer challenges you. They've never cracked under pressure." },
        { speaker: "The Evaluator", text: "Your numbers are adequate. Your potential is... limited." },
        { speaker: "milunchlady", text: "Stress amplifier is maxed. Win or break." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You dethroned the evaluator. The system recalculates." },
        { speaker: "The Evaluator", text: "Impossible. My metrics were flawless." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Evaluator", text: "As predicted. Return to your designated percentile." },
        { speaker: "milunchlady", text: "The numbers own you now." },
      ],
      rewardGold: 100,
      rewardXp: 50,
      firstClearBonus: 175,
      status: "published",
    },
  ],

  // Chapter 2-3: Homecoming Peak
  "2-3": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Nomination Round",
      description: "Homecoming court nominees duel for votes. Rep gains doubled.",
      opponentName: "Homecoming Candidate",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Homecoming nominations. Reputation is worth double tonight." },
        { speaker: "Homecoming Candidate", text: "Every vote is a weapon. I've been campaigning since freshman year." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Nominated. Your reputation soars. Enjoy the altitude." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Not even nominated. The court doesn't know your name." },
      ],
      rewardGold: 50,
      rewardXp: 25,
      firstClearBonus: 100,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Crown Chase",
      description: "The gym is electric. Popularity peaks before the fall.",
      opponentName: "Stressed Scholar",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The gym is draped in cheap streamers. This is the peak." },
        { speaker: "Stressed Scholar", text: "I don't care about the crown. I care about what people see." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Crown's in reach. But peaks have cliffs." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "The gym remembers losers longer than winners." },
      ],
      rewardGold: 70,
      rewardXp: 35,
      firstClearBonus: 125,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Coronation",
      description: "One crown. Maximum reputation. The collapse begins after.",
      opponentName: "Hall Monitor",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The crown. The spotlight. Every eye in the gym. Double rep." },
        { speaker: "Hall Monitor", text: "Popularity is temporary. Authority is forever." },
        { speaker: "milunchlady", text: "Take the crown or watch someone else wear it." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Crowned. Maximum reputation. Remember: after the peak comes the fall." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Hall Monitor", text: "The crown goes to someone who follows the rules." },
        { speaker: "milunchlady", text: "Homecoming peak — and you weren't on it." },
      ],
      rewardGold: 100,
      rewardXp: 50,
      firstClearBonus: 175,
      status: "published",
    },
  ],

  // Chapter 2-4: Hall Monitors Watching
  "2-4": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Hallway Checkpoint",
      description: "Hall passes checked. Trap costs slashed. Authority is everywhere.",
      opponentName: "Hall Monitor",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Monitors on every corner. Traps cost nothing now. Control week." },
        { speaker: "Hall Monitor", text: "Pass. Show me your pass. Now." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Slipped past the checkpoint. But they're always watching." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Detained. The system adds another mark to your file." },
      ],
      rewardGold: 50,
      rewardXp: 25,
      firstClearBonus: 100,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Detention Shadow",
      description: "The detention room looms. Trap cards are cheap and deadly.",
      opponentName: "Homecoming Candidate",
      difficulty: "medium",
      aiDifficulty: "medium",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The detention room casts a long shadow. Trap_Cost-2." },
        { speaker: "Homecoming Candidate", text: "They took my crown. Said I violated code of conduct." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Avoided detention. But the shadow doesn't lift." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Detention. The monitors write your name in permanent ink." },
      ],
      rewardGold: 70,
      rewardXp: 35,
      firstClearBonus: 125,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Authority Crackdown",
      description: "The monitors have gone too far. Someone has to push back.",
      opponentName: "The Evaluator",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The monitors answer to someone. Time to find out who." },
        { speaker: "The Evaluator", text: "Order must be maintained. You are the disorder." },
        { speaker: "milunchlady", text: "Control week ends when you end it." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "The monitors back off. Sophomore year ends in rebellion." },
        { speaker: "The Evaluator", text: "This changes nothing. Junior year will be... corrective." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Evaluator", text: "Filed. Flagged. You'll be watched closely next year." },
        { speaker: "milunchlady", text: "The system remembers. It always remembers." },
      ],
      rewardGold: 100,
      rewardXp: 50,
      firstClearBonus: 175,
      status: "published",
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // ACT 3 — JUNIOR
  // ═══════════════════════════════════════════════════════════════════

  // Chapter 3-1: Standardized Evaluation
  "3-1": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Bubble Sheet",
      description: "Fill in the bubbles. The machine scores your soul.",
      opponentName: "Test Subject",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Number 2 pencils only. The machine doesn't accept alternatives." },
        { speaker: "Test Subject", text: "I filled in C for everything. It doesn't matter anymore." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You beat the test. But the test never really ends." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Forced minor breakdown. The bubbles own you." },
      ],
      rewardGold: 80,
      rewardXp: 40,
      firstClearBonus: 150,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Proctor's Watch",
      description: "Eyes forward. No talking. Minor breakdowns are forced.",
      opponentName: "Party Crasher",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The proctor sees everything. Breakdowns are mandatory." },
        { speaker: "Party Crasher", text: "I crashed the wrong party — this one has standardized tests." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Survived the proctor's gaze. Your breakdown was... manageable." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Breakdown: not minor. The evaluation reveals what you hid." },
      ],
      rewardGold: 110,
      rewardXp: 55,
      firstClearBonus: 200,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Score Release",
      description: "The numbers arrive. They define everything from here.",
      opponentName: "The Principal",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The scores are in. The principal delivers them personally." },
        { speaker: "The Principal", text: "Your score is your sentence. I'm just the messenger." },
        { speaker: "milunchlady", text: "Fight the system or accept the number." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You rejected the score. The system doesn't know what to do with you." },
        { speaker: "The Principal", text: "Unscoreable. That's... unprecedented." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Principal", text: "Your score has been recorded. Permanently." },
        { speaker: "milunchlady", text: "The machine scored you. You are now a number." },
      ],
      rewardGold: 150,
      rewardXp: 75,
      firstClearBonus: 250,
      status: "published",
    },
  ],

  // Chapter 3-2: Senior Party Early
  "3-2": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Uninvited",
      description: "You weren't on the list. All vices are active.",
      opponentName: "Party Crasher",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Senior party. You're a junior. All vices are live. Good luck." },
        { speaker: "Party Crasher", text: "We're all uninvited. That's what makes it real." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You're in. The seniors noticed. That's not always good." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Bounced. All those active vices hit you at once." },
      ],
      rewardGold: 80,
      rewardXp: 40,
      firstClearBonus: 150,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Time Warp",
      description: "Time accelerates. Seniors move like ghosts. Every vice bites.",
      opponentName: "Test Subject",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Time's moving wrong. The seniors look older than they should." },
        { speaker: "Test Subject", text: "I came here to forget my score. Now I can't remember it at all." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You caught the time slip. Most juniors don't." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Time skipped. You lost hours. The vices filled them in." },
      ],
      rewardGold: 110,
      rewardXp: 55,
      firstClearBonus: 200,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Dawn Patrol",
      description: "The party won't end. Multi-player boss event.",
      opponentName: "The Principal",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "5 AM. The party's still going. The principal showed up." },
        { speaker: "The Principal", text: "This gathering is unauthorized. All participants will be evaluated." },
        { speaker: "milunchlady", text: "Every vice active. Every player targeted. Survive the dawn." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Survived till sunrise. The party's over but you're still standing." },
        { speaker: "The Principal", text: "You'll regret being the last one awake." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Principal", text: "Found unconscious at the event. Noted in your file." },
        { speaker: "milunchlady", text: "The dawn patrol got you. All vices cashed in at once." },
      ],
      rewardGold: 150,
      rewardXp: 75,
      firstClearBonus: 250,
      status: "published",
    },
  ],

  // Chapter 3-3: Expulsion Event
  "3-3": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Empty Chair",
      description: "Someone's gone. The highest vice got them expelled.",
      opponentName: "The Expelled",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Count the chairs. One's empty. Nobody talks about why." },
        { speaker: "The Expelled", text: "They didn't expel me. The cafeteria did. My vice got too loud." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You beat the expelled. But their chair is still empty." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Lose enough and your chair goes empty too." },
      ],
      rewardGold: 80,
      rewardXp: 40,
      firstClearBonus: 150,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Locker Cleanout",
      description: "Evidence of the expelled student. The cafeteria consumes its own.",
      opponentName: "Test Subject",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Their locker's being cleaned out. Photos, notes, everything gone." },
        { speaker: "Test Subject", text: "I found their deck in the locker. The cards are... wrong now." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You saw what was in the locker. You can't unsee it." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Highest vice destroyed. Theirs... or yours next." },
      ],
      rewardGold: 110,
      rewardXp: 55,
      firstClearBonus: 200,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "The Vanishing",
      description: "Face whatever consumed the expelled student.",
      opponentName: "The Principal",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The expelled student left something behind. A warning." },
        { speaker: "The Principal", text: "Expulsion isn't punishment. It's mercy. You should be so lucky." },
        { speaker: "milunchlady", text: "Highest vice gets destroyed. Make sure it's not yours." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You survived what they didn't. The cafeteria spat someone else out." },
        { speaker: "The Principal", text: "Interesting. You're more resilient than your file suggests." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Principal", text: "Your vice was the highest. The cafeteria has made its choice." },
        { speaker: "milunchlady", text: "Another empty chair. The school moves on. It always does." },
      ],
      rewardGold: 150,
      rewardXp: 75,
      firstClearBonus: 250,
      status: "published",
    },
  ],

  // Chapter 3-4: The Bell Doesn't Ring
  "3-4": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Frozen Clock",
      description: "Third period never ended. Reality glitches. Cards shuffle.",
      opponentName: "Glitch Entity",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Look at the clock. It stopped. The bell should have rung twenty minutes ago." },
        { speaker: "Glitch Entity", text: "T̴i̷m̸e̵ ̶d̴o̸e̶s̷n̵'̴t̶ ̸w̵o̷r̸k̵ ̷h̶e̷r̷e̶ ̵a̶n̶y̷m̶o̶r̶e̵.̶" },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You forced the clock forward. But something's still wrong." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Stuck in third period forever. Card text is scrambling." },
      ],
      rewardGold: 80,
      rewardXp: 40,
      firstClearBonus: 150,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Scrambled Texts",
      description: "Card text shuffles mid-duel. Nothing reads right.",
      opponentName: "The Expelled",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Your cards say different things than yesterday. Random everything." },
        { speaker: "The Expelled", text: "I came back. But I'm not... right. Neither are my cards." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You won with scrambled cards. Impressive. Terrifying." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Can't win when your own cards lie to you." },
      ],
      rewardGold: 110,
      rewardXp: 55,
      firstClearBonus: 200,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Reality Break",
      description: "The cafeteria dims. Everything is random. The bell will never ring.",
      opponentName: "The Principal",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The cafeteria lights are flickering. The bell is dead. This is the glitch." },
        { speaker: "The Principal", text: "The bell rings when I say it rings. And I say... never." },
        { speaker: "milunchlady", text: "Card text shuffle. Random targets. Random everything. Survive." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "The bell rings. Once. Junior year is over. But reality never fully recovered." },
        { speaker: "The Principal", text: "You broke the loop. For now." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Principal", text: "The bell never rang. You're still in third period. Forever." },
        { speaker: "milunchlady", text: "Stuck in the glitch. The cafeteria keeps you." },
      ],
      rewardGold: 150,
      rewardXp: 75,
      firstClearBonus: 250,
      status: "published",
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // ACT 4 — SENIOR
  // ═══════════════════════════════════════════════════════════════════

  // Chapter 4-1: Future Planning
  "4-1": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Guidance Office",
      description: "The counselor shows you brochures. Pick your path.",
      opponentName: "Path Seeker",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "College apps. Trade school forms. The exit doors have labels now." },
        { speaker: "Path Seeker", text: "I picked a path. It picked me back. Neither of us is happy." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Path selected. Path locked. No going back." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "No path selected. The counselor picks for you." },
      ],
      rewardGold: 120,
      rewardXp: 60,
      firstClearBonus: 200,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Application Season",
      description: "Essays, interviews, rejections. The future is a battlefield.",
      opponentName: "Ranked Rival",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Application season. Every rejection is a vice trigger." },
        { speaker: "Ranked Rival", text: "My application was better. My rank was higher. Why are we even dueling?" },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Accepted somewhere. Whether it's where you wanted... different question." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Ranked Rival", text: "Waitlisted. Again. The path narrows." },
      ],
      rewardGold: 160,
      rewardXp: 80,
      firstClearBonus: 275,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Path Locked",
      description: "Your future is decided. Was it ever your choice?",
      opponentName: "The Dean",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The path is locked. The dean holds the key." },
        { speaker: "The Dean", text: "Your transcript tells a story. Let me read it to you." },
        { speaker: "milunchlady", text: "Fight for your path or accept the one they gave you." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Path: yours. The dean stamps the form reluctantly." },
        { speaker: "The Dean", text: "Fine. But the cafeteria will miss you." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Dean", text: "Path denied. The cafeteria still needs you." },
        { speaker: "milunchlady", text: "Locked into what they chose. Sound familiar?" },
      ],
      rewardGold: 200,
      rewardXp: 100,
      firstClearBonus: 350,
      status: "published",
    },
  ],

  // Chapter 4-2: Final Rankings
  "4-2": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Class Rank Drop",
      description: "Final rankings posted. The leaderboard modifier is live.",
      opponentName: "Ranked Rival",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Final class rankings. Your number follows you out the door." },
        { speaker: "Ranked Rival", text: "I'm top 10. You're not even top 50. Know your place." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Rank climbed. The leaderboard bends to force." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Rank dropped. Low stability makes the UI crack." },
      ],
      rewardGold: 120,
      rewardXp: 60,
      firstClearBonus: 200,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Valedictorian Race",
      description: "Two slots. Fifty contenders. The system rewards only dominance.",
      opponentName: "Path Seeker",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Valedictorian race. Low stability cracks the interface itself." },
        { speaker: "Path Seeker", text: "I don't want to be valedictorian. I want to be free." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Top of the class. The UI stabilizes. For now." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "The cracks spread. Your rank falls. The UI glitches harder." },
      ],
      rewardGold: 160,
      rewardXp: 80,
      firstClearBonus: 275,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Number One",
      description: "Final ranking. The system's last weapon.",
      opponentName: "The Dean",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The final ranking. The dean posts it personally." },
        { speaker: "The Dean", text: "Your rank is your legacy. Your legacy is your prison." },
        { speaker: "milunchlady", text: "Leaderboard modifier maxed. Stability cracks everything." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Rank 1. The system has nothing left to throw at you." },
        { speaker: "The Dean", text: "Congratulations. You won the game nobody should play." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Dean", text: "Your final ranking: unranked. The system erases you." },
        { speaker: "milunchlady", text: "The leaderboard closes. You were never on it." },
      ],
      rewardGold: 200,
      rewardXp: 100,
      firstClearBonus: 350,
      status: "published",
    },
  ],

  // Chapter 4-3: Graduation Rehearsal
  "4-3": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Walk-Through",
      description: "Practice the walk. No new vices. Existing ones hit twice as hard.",
      opponentName: "Ranked Rival",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Rehearsal. Walk single file. No new vices — but the old ones scream." },
        { speaker: "Ranked Rival", text: "Almost out. Almost free. Why does it feel like a trap?" },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Clean walk. The exit doors are visible. Don't look back." },
      ],
      postMatchLoseDialogue: [
        { speaker: "milunchlady", text: "Tripped in rehearsal. Vice effects doubled. The doors seem farther." },
      ],
      rewardGold: 120,
      rewardXp: 60,
      firstClearBonus: 200,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Cap and Gown",
      description: "Put on the costume. Tension amplified. Vice effects doubled.",
      opponentName: "The Dean",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Cap and gown distributed. You look like everyone else now." },
        { speaker: "The Dean", text: "The uniform makes you equal. The cafeteria made you different." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "Gown fits. The doors are closer. Tension is unbearable." },
      ],
      postMatchLoseDialogue: [
        { speaker: "The Dean", text: "Take off the gown. You're not ready." },
        { speaker: "milunchlady", text: "Vice effects doubled. The gown feels like a straitjacket." },
      ],
      rewardGold: 160,
      rewardXp: 80,
      firstClearBonus: 275,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Dress Rehearsal",
      description: "Final practice. Everything amplified. The doors are right there.",
      opponentName: "Your Reflection",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Final rehearsal. You look in the gym mirror and your reflection moves wrong." },
        { speaker: "Your Reflection", text: "You practiced being someone else for four years. I'm what's left." },
        { speaker: "milunchlady", text: "No new vice. Old vices doubled. Tension maxed. This is the dress rehearsal." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You beat your reflection. The real test is tomorrow." },
        { speaker: "Your Reflection", text: "See you at graduation. I'll be wearing your face." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Your Reflection", text: "I'll walk for you. Nobody will know the difference." },
        { speaker: "milunchlady", text: "Your reflection won rehearsal. What walks across that stage tomorrow?" },
      ],
      rewardGold: 200,
      rewardXp: 100,
      firstClearBonus: 350,
      status: "published",
    },
  ],

  // Chapter 4-4: Graduation Day
  "4-4": (chapterId) => [
    {
      chapterId,
      stageNumber: 1,
      name: "Empty Cafeteria",
      description: "The cafeteria is deserted. One table left. One chair.",
      opponentName: "Your Shadow Self",
      difficulty: "hard",
      aiDifficulty: "hard",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The cafeteria is empty. Every table gone except one." },
        { speaker: "Your Shadow Self", text: "Sit down. We need to talk about who you became." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "First round: you. But the shadow doesn't leave." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Your Shadow Self", text: "You can't even beat yourself. How will you graduate?" },
      ],
      rewardGold: 120,
      rewardXp: 60,
      firstClearBonus: 200,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 2,
      name: "Mirror Match",
      description: "Your shadow self plays your deck, your style, your vices.",
      opponentName: "Your Shadow Self",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "The shadow plays your cards. Knows your moves. IS your moves." },
        { speaker: "Your Shadow Self", text: "Every vice you collected, I collected. Every choice you made, I made the other one." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You beat your mirror. One more duel. The final one." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Your Shadow Self", text: "I'm the better version. I always was." },
        { speaker: "milunchlady", text: "Lost to yourself. The cafeteria's favorite tragedy." },
      ],
      rewardGold: 160,
      rewardXp: 80,
      firstClearBonus: 275,
      status: "published",
    },
    {
      chapterId,
      stageNumber: 3,
      name: "Final Self Duel",
      description: "Face yourself or repeat forever. The cafeteria waits for your answer.",
      opponentName: "Your Shadow Self",
      difficulty: "boss",
      aiDifficulty: "boss",
      preMatchDialogue: [
        { speaker: "milunchlady", text: "Last duel. The cafeteria is empty. The exit is behind you. The shadow sits across." },
        { speaker: "Your Shadow Self", text: "Beat me and you graduate. Lose and we do all four years again." },
        { speaker: "milunchlady", text: "This is it. Everything you learned. Everything you became. Play." },
      ],
      postMatchWinDialogue: [
        { speaker: "milunchlady", text: "You graduated. The cafeteria doors open for the last time." },
        { speaker: "Your Shadow Self", text: "You chose yourself. That's all graduation ever was." },
      ],
      postMatchLoseDialogue: [
        { speaker: "Your Shadow Self", text: "See you at orientation. Again." },
        { speaker: "milunchlady", text: "The seating chart posts tomorrow. Your name is on it. Again." },
      ],
      rewardGold: 200,
      rewardXp: 100,
      firstClearBonus: 350,
      status: "published",
    },
  ],
};
