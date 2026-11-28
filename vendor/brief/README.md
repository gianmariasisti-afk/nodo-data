# One-page brief: PDF library and typefaces

Loaded by the app only when someone makes a one-page brief (file page, More menu). Nothing here runs at start-up.

- `pdf-lib.min.js`: pdf-lib 1.17.1 (MIT, https://github.com/Hopding/pdf-lib), UMD build, global `PDFLib`.
- `fontkit.umd.min.js`: @pdf-lib/fontkit 1.1.1 (MIT), global `fontkit`, lets pdf-lib embed TrueType fonts.
- `Figtree_400Regular.ttf`, `Figtree_600SemiBold.ttf`, `Outfit_500Medium.ttf`: the app's typefaces as TrueType
  (SIL Open Font License 1.1, see `fonts/`), from @expo-google-fonts. Embedded as subsets in each PDF; they cover
  the Latin letters of all 27 member states (ř, ł, ő, ș, ā …).
