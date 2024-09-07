import chalk from "chalk";
import { DocumentMap } from "./types.js";

export const printMap = (
  content: string,
  documentMap: DocumentMap,
  regex: RegExp | undefined
): void => {
  for (const type in documentMap) {
    for (const positionName in documentMap[type as keyof typeof documentMap]) {
      const position =
        documentMap[type as keyof typeof documentMap][positionName];

      const blockName = `${type} :: ${positionName.replaceAll(
        "\u001f",
        " :: "
      )}`;
      if (regex && !blockName.match(regex)) {
        continue;
      }
      console.log("\n" + chalk.blue(blockName));
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
