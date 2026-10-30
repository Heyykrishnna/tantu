# Local application fonts

Inter is used for interface text and Poppins for headings and the wordmark. The application loads the local WOFF2 files through `next/font/local`; neither browser rendering nor production builds fetch a font service.

The sources are the official Google Fonts distributions of [Inter](https://github.com/google/fonts/blob/main/ofl/inter/METADATA.pb) and [Poppins](https://github.com/google/fonts/blob/main/ofl/poppins/METADATA.pb). Their unmodified SIL Open Font License notices are included as [Inter-OFL.txt](Inter-OFL.txt) and [Poppins-OFL.txt](Poppins-OFL.txt).

The original TTF files were converted with the existing FontTools 4.55.3 WOFF2 compressor, without glyph subsetting or design changes. [provenance.json](provenance.json) records source filenames, original and served SHA-256 digests, conversion details and distribution source. No font conversion package is needed at application runtime or during a normal build.
