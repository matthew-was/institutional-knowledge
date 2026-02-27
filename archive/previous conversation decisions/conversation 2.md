Estate Intelligence Project Review
Decisions Made
Text Extraction Approach: Docling + Tesseract (Phase 1)

Selected Docling as primary framework with Tesseract as OCR backend for Phase 1
Rationale: "Docling with Tesseract as the backend would give you a complete pipeline quickly. You get Docling's layout understanding for born-digital PDFs and modern documents, plus Tesseract for the scanned materials."
Not locked in: "You're not locked in. Docling allows you to choose the OCR engine via ocr_options settings, supporting Tesseract, EasyOCR, RapidOCR, and others."

Diagram/Map Strategy: Reference Material, Not Information Extraction

Maps and diagrams should surface as reference material without requiring detailed understanding
Established constraint: "diagrams and maps should have enough information for them to be surfaced as reference material for specific questions without needing to understand the detail, as long as enough is understood about the image to make the reference appropriate"

Diagram Processing: Text Context + Image Preservation

Selected approach of preserving diagram images with surrounding text context for vector search relevance
Workflow: OCR text normally, detect/preserve images as distinct chunks, embed text context heavily, store images in S3
Quote: "You're not asking it to understand the diagram's content—you're asking it to recognize 'this is a diagram' and preserve it alongside the text that contextualizes it"

Diagram Classification: Lightweight Classification Over Deep Understanding

Use basic image classification (CLIP/BLIP) for diagram type categorization rather than specialized understanding models
Rationale: "This is much simpler than specialized diagram understanding. Your senior developer doesn't need to study vision-language models or geometric recognition"

Rationale (Implied but Not Explicitly Written Down)
Why Docling Over Pure Tesseract

Docling's layout models add value for born-digital PDFs that pure OCR cannot provide
Implied: "Docling sidesteps OCR when it can, in favor of computer vision models trained to recognize and categorize the visual elements on a page"

Why Not Commercial Vision APIs for Document Processing

Cost and data privacy concerns drive preference for self-hosted solutions
Supporting quote: "Hosted APIs such as Azure Computer Vision and Mistral OCR cover many of these needs, but they route sensitive documents through vendor infrastructure"

Why GPU Models Deferred to Phase 2+

CPU-based Tesseract is appropriate for Phase 1 learning phase (hundreds of documents)
"For hundreds of documents in Phase 1, CPU is fine. For tens of thousands in Phase 4, this becomes a hard ROI decision" (GPU vs. CPU trade-off)

Why Avoid Specialized Handwriting Models for Maps

"This approach also sidesteps the handwriting problem on maps entirely—you don't need OCR to work on map annotations; you just need to recognize 'this is a map' and surface it contextually"

Why Vector Embeddings Are Primary Discovery Mechanism

Text context around diagrams should naturally surface them in vector search without needing diagram content extraction
Test assumption: "If a family letter says 'as shown in the attached survey map of the north field,' and you embed that text heavily, will queries about 'the north field' reliably surface that map"

Constraints or Requirements That Emerged
Text Requirements on Maps/Diagrams

Maps and diagrams will have some text (hopefully mostly not handwritten) that provides context
New requirement: "There should probably be a flag when a map or diagram doesn't have much text for a human to provide some additional context if the diagram/map is uploaded on its own"
This constraint requires UI/UX for human-provided supplementary context on low-text diagrams

Handwriting Limitation Acknowledged

Handwritten text recognition remains problematic across all open-source OCR solutions
Quote: "For truly challenging handwritten material, commercial options like AWS Textract exist, but that changes your 'local execution' story"
Decision: Accept this limitation in Phase 1, prototype alternatives in Phase 2+ if needed

Prototype Real Documents Early

Theory vs. reality gap identified: benchmark scores matter less than actual performance on family documents
Requirement emerged: "Test this assumption in Phase 1 with actual documents. If text context is sufficient, you're done—diagrams are just preserved artifacts. If not, then Phase 2 can add lightweight image classification"

Tensions with Existing ADRs
No Direct Conflicts Identified, but one architectural note:
Four-Component Pipeline Remains Valid

The document processing approach doesn't conflict with the 4-component pipeline
C2 (Extraction + Embedding) now explicitly includes: text extraction via Docling/Tesseract, image preservation with metadata, text embedding for vector search
Maps/diagrams flow through C2 as: [image preservation + context extraction] → [embed surrounding text] → [store image in S3 with reference]

Human-Maintained Domain Context Constraint Strengthened

New supplementary context requirement for low-text diagrams aligns with "system flags, never auto-adds" principle
Human must manually provide context when diagram is uploaded with insufficient text
This is consistent with philosophy; creates new metadata field for manual human input

Summary: No contradictions with existing ADRs. The conversation primarily refined C2 (text extraction strategy) and established a clear constraint around diagram/map handling that requires Phase 1 prototyping to validate.
