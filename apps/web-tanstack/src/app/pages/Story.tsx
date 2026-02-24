import { StoryProvider, ChapterMap, StoryIntro, DialogueBox } from "@/components/story";
import { TrayNav } from "@/components/layout/TrayNav";

export function Story() {
  return (
    <StoryProvider>
      <ChapterMap />
      <StoryIntro />
      <DialogueBox />
      <TrayNav />
    </StoryProvider>
  );
}
