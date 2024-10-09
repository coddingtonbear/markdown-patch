import chalk from "chalk";
import { DocumentMap } from "./types.js";

export const printMap = (
  content: string,
  documentMap: DocumentMap,
  regex: RegExp | undefined
): void => {
  for (const frontmatterField in documentMap.frontmatter) {
    const blockName = `[${chalk.magenta("frontmatter")}] ${chalk.blueBright(frontmatterField)}`;
    console.log("\n" + blockName + "\n");
    console.log(JSON.stringify(documentMap.frontmatter[frontmatterField]));
  }

  const targetablePositions = {
    heading: documentMap.heading,
    block: documentMap.block,
  };
  for (const type in targetablePositions) {
    for (const positionName in targetablePositions[
      type as keyof typeof targetablePositions
    ]) {
      const position =
        targetablePositions[type as keyof typeof targetablePositions][
          positionName
        ];

      const blockName = `[${chalk.magenta(type)}] ${positionName
        .split("\u001f")
        .map((pos) => chalk.blueBright(pos))
        .join(",")}`;
      if (regex && !blockName.match(regex)) {
        continue;
      }
      console.log("\n" + blockName + "\n");
      if (position.content.start < position.marker.start) {
        console.log(
          content
            .slice(position.content.start - 100, position.content.start)
            .replaceAll("\n", "\\n\n") +
            chalk.black.bgGreen(
              content
                .slice(position.content.start, position.content.end)
                .replaceAll("\n", "\\n\n")
            ) +
            content
              .slice(
                position.content.end,
                Math.min(position.content.end + 100, position.marker.start)
              )
              .replaceAll("\n", "\\n\n") +
            chalk.black.bgRed(
              content
                .slice(position.marker.start, position.marker.end)
                .replaceAll("\n", "\\n\n")
            ) +
            content
              .slice(position.marker.end, position.marker.end + 100)
              .replaceAll("\n", "\\n\n")
        );
      } else {
        console.log(
          content
            .slice(position.marker.start - 100, position.marker.start)
            .replaceAll("\n", "\\n\n") +
            chalk.black.bgRed(
              content
                .slice(position.marker.start, position.marker.end)
                .replaceAll("\n", "\\n\n")
            ) +
            content
              .slice(
                position.marker.end,
                Math.min(position.marker.end + 100, position.content.start)
              )
              .replaceAll("\n", "\\n\n") +
            chalk.black.bgGreen(
              content
                .slice(position.content.start, position.content.end)
                .replaceAll("\n", "\\n\n")
            ) +
            content
              .slice(position.content.end, position.content.end + 100)
              .replaceAll("\n", "\\n\n")
        );
      }
    }
  }
};
