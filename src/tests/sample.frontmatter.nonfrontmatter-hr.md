
---

# Overview
I came up with this project for supporting [[Obsidian Local Rest API]] (and via that [[Obsidian Web]]) because I often need to shove data into Markdown documents for posterity, but want to be able to do that programmatically with more care than just shoving content to the end of a file.
# Problems
- ~~It would be nice for the mechanism to be able to handle something like `upsert` for frontmatter fields.  See [[#^e6068e]] in addition to what we already support [[#^259a73]].~~
	- This was solved by making every content block directly-addressable.  All interactions treat the document as a key-value mapping.
- ~~You can't use our earlier header delimiter `::` in an HTTP header; how did I not notice that?  I've had a [conversation with ChatGPT](https://chatgpt.com/share/117b262a-f534-40e6-bc05-287758706f34) to land on a choice of `@#@` instead, but there aren't obvious good options.  See [[#^1d6271]]~~
	- I changed my mind in the end and went with the more-likely-to-collide-but-at-least-not-bizarre `///`.
- Should we allow partial matches?  The pros are that it would make the usual, garden path of just wanting to push content into a section very easy.  The cons are that it makes it kind of unclear what's going to happen when you do an `upsert` or `insert` for a particular value.  (See [[#^bfec1f]] for more).

# Actions
| Name      | Description                                                                                                                                                                       | Heading? | Frontmatter? | Block               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ------------------- |
| `update`  | Find the referenced `target` and replace the content at that region.                                                                                                              | ✅        | ✅            | ✅                   |
| `append`  | Find the referenced `target` and add content to the end of its region.                                                                                                            | ✅        | ✅            | ✅                   |
| `prepend` | Find the referenced `target` and add content to the beginning of its region.                                                                                                      | ✅        | ✅            | ✅                   |
| `insert`  | Find the path leading to the referenced `target` and add the specified content under a the specified name. This will create a new header or frontmatter field if necessary.       | ✅        | ✅            | ❌[^block-ambiguity] |
| `upsert`  | Find the path leading to the referenced `target` and either replace the content under the specified name, or add new content with a new header or frontmatter field if necessary. | ✅        | ✅            | ❌[^block-ambiguity] |

^2c67a6

# Headers
| Header             | Explanation                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Target-Type`      | `heading`, `block`, `frontmatter`                                                                                                                                                              |
| `Target`           | Name of the target:<br>- `heading`: The `///`-delimited path to the heading to replace the content of.  E.g. `Page Targets///Block///Use Cases`.  This value should be URL-encoded.            |
| `Target-Delimiter` | By default, we use `///` to delimit a `Target`, but it's remotely possible that this value might be present in a header.  If it is, you can specify a different delimiter to use for `Target`. |

^1d6271

# Page Targets

## Heading

| Heading       | Value                                                 |
| ------------- | ----------------------------------------------------- |
| `Target-Type` | `heading`                                             |
| `Target`      | The path to the heading you would like to append to.  |

^bfec1f

| Position | Where                                                          |
| -------- | -------------------------------------------------------------- |
| Start    | Beginning of line immediately following line named by heading  |
| End      | Last newline before heading of same or higher priority or EOF. |
|          |                                                                |
Unlike with [[#Heading]], this targets the *content* of the heading and does not include the heading iself.
- ✅: ...replacing the content specified by a particular heading.
- ✅: ...appending content to a block specified by a particular heading.
## Block
| Position | Where                                                  |
| -------- | ------------------------------------------------------ |
| Start    | Beginning of line for specified block.                 |
| End      | Last character (including newline) of specified block. |
A "Block" in Obsidian can be any *block*-type element.  This might mean a paragraph, but it could also mean a table, but how block references are marked differs in Obsidian depending upon what kind of block is being marked.
### Use Cases
- ✅: ...replacing the content specified by a particular block ID.
	- I want to be able to replace a whole table or whole paragraph with new content.
- ✅: ...appending content to a block specified by a particular block ID.
	- I want to be able to add new rows to an existing table.
	- I want to be able to add new content to the end of a line.

## Frontmatter Field

| Position | Where                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Start    | First character of content referenced by a particular frontmatter field. |
| End      | Last character of content referenced by a particular frontmatter field.  |
### Use Cases
- ✅: ...appending content to an existing frontmatter field.
- ✅: ...replacing the content of an existing frontmatter field. ^259a73
- ✅: ...adding a new frontmatter field. ^e6068e
## Document Properties (Exploratory)

[^block-ambiguity]: There is currently no obvious place to plop a block were we to create a new one.  So, I might implement this such that these actions *work*, but will just add the block to the end of a file.  This isn't great, but it's at least consistent?
