-- ============================================================================
-- GapFinder AI: Production Supabase Seed Script
-- Demo Account: demo@gapfinder.ai / Demo@123
-- Student ID: 00000000-0000-0000-0000-000000000001
-- ============================================================================

-- Ensure pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Demo Student in auth.users and public.students
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo@gapfinder.ai',
    crypt('Demo@123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Demo Student"}'::jsonb,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    encrypted_password = crypt('Demo@123', gen_salt('bf')),
    email_confirmed_at = now();

INSERT INTO public.students (
    id,
    email,
    name,
    target_exam,
    exam_date,
    daily_hours,
    is_demo,
    created_at,
    updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'demo@gapfinder.ai',
    'Demo Student',
    'AP / National Advanced Biology Examination',
    '2026-11-18',
    2.0,
    true,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    target_exam = EXCLUDED.target_exam,
    exam_date = EXCLUDED.exam_date,
    daily_hours = EXCLUDED.daily_hours,
    is_demo = EXCLUDED.is_demo;

-- 2. Subjects
INSERT INTO public.subjects (id, student_id, name)
VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Biology')
ON CONFLICT (student_id, name) DO NOTHING;

-- 3. Documents (Study Materials)
INSERT INTO public.documents (
    id, student_id, subject_id, subject_name, title, file_name, file_path, doc_type, file_size, page_count, chunk_count, status, is_sample, uploaded_at
) VALUES (
    '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Advanced Placement Biology Official Syllabus', 'Biology_Syllabus_2026.pdf', 'Biology_Syllabus_2026.pdf', 'Syllabus', 428500, 8, 5, 'Ready', true, '2026-11-05T09:15:00.000Z'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.documents (
    id, student_id, subject_id, subject_name, title, file_name, file_path, doc_type, file_size, page_count, chunk_count, status, is_sample, uploaded_at
) VALUES (
    '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Cellular & Molecular Biology Core Textbook', 'Biology_Textbook.pdf', 'Biology_Textbook.pdf', 'Textbook', 3842100, 96, 10, 'Ready', true, '2026-11-05T09:18:00.000Z'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.documents (
    id, student_id, subject_id, subject_name, title, file_name, file_path, doc_type, file_size, page_count, chunk_count, status, is_sample, uploaded_at
) VALUES (
    '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'National Biology Examination Papers (2022-2025)', 'Biology_Past_Papers_2022_2025.pdf', 'Biology_Past_Papers_2022_2025.pdf', 'Past Paper', 1592000, 24, 5, 'Ready', true, '2026-11-05T09:22:00.000Z'
) ON CONFLICT (id) DO NOTHING;

-- 4. Document Chunks with Vector Embeddings
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 14, 'Chapter 1: Cell Biology', 'Fluid Mosaic Model and Membrane Transport', 'Cell Biology', 'The plasma membrane is described by the fluid mosaic model as a dynamic phospholipid bilayer with amphipathic phospholipids, cholesterol molecules that buffer fluidity across temperatures, and integral transmembrane proteins. Passive diffusion and facilitated diffusion move solutes down their concentration gradient without ATP input, whereas active transport uses ATP hydrolysis (such as the Na+/K+ ATPase pump) to move ions against their electrochemical gradient.', '[0.3005,0,0.10017,0,0.06678,-0.16695,0.03339,0.03339,0.10017,0.03339,0,0,0,-0.16695,0.23372,0.06678,0,-0.03339,0.03339,0,0.20033,-0.03339,0.03339,0,0.13356,-0.13356,0.06678,-0.13356,0.10017,0.10017,0.06678,-0.10017,0.06678,0,0.16695,-0.20033,0.43406,0.03339,0.40067,-0.06678,0.23372,-0.13356,0,0.03339,0.06678,0.03339,0.26711,-0.06678,0,0.03339,0,-0.03339,0,-0.06678,0.06678,-0.10017,0,0.06678,0,0.03339,0.13356,0.03339,0.03339,0.03339]'::vector(64), 0
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 19, 'Chapter 1: Cell Biology', 'Eukaryotic Organelles and Mitotic Cell Division', 'Cell Biology', 'Eukaryotic compartmentalization separates metabolic pathways: the rough endoplasmic reticulum synthesizes secretory proteins, the Golgi apparatus modifies and sorts glycoproteins, and lysosomes perform intracellular digestion using hydrolytic enzymes at acidic pH (approx. 4.8). During mitosis, sister chromatids separate at anaphase after spindle fibers attach to kinetochores during metaphase, producing two genetically identical diploid daughter cells.', '[0.03962,0,0.23773,0,0.15849,0.07924,0.23773,-0.07924,0.35659,-0.07924,0.07924,-0.07924,0.03962,0,0.19811,0.03962,0.07924,-0.11886,0.07924,-0.03962,0.03962,0,0,0,0,0.07924,0.27735,-0.11886,0.11886,-0.27735,0.11886,-0.07924,0.03962,-0.07924,0,0,0.27735,0,0.31697,0.03962,0.07924,0.03962,0.07924,-0.03962,0,0.11886,0.15849,0,0.07924,-0.03962,0.19811,0.03962,0.03962,-0.07924,0.15849,-0.07924,0.15849,-0.23773,0,0,0.03962,0.03962,0,-0.07924]'::vector(64), 1
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 28, 'Chapter 2: Genetics', 'DNA Replication and Transcription-Translation', 'Genetics', 'Semiconservative DNA replication requires helicase to unwind the double helix at the replication fork, primase to synthesize an RNA primer, and DNA polymerase III to add deoxynucleotides exclusively in the 5-prime to 3-prime direction. The leading strand is synthesized continuously while the lagging strand is synthesized discontinuously as Okazaki fragments later sealed by DNA ligase.', '[0.22086,0,0.07362,0,0.11043,0.07362,0.03681,-0.14724,0,-0.07362,0,0.03681,0.03681,0.07362,0.55216,-0.07362,0,0.07362,0.03681,-0.07362,0.07362,-0.11043,0.14724,-0.33129,0.14724,0,0,0.03681,0,-0.07362,0,-0.03681,0.03681,-0.07362,0,0,0.36811,0,0.29448,0.03681,0.03681,-0.07362,0.11043,0,0,0,0.22086,0,0.03681,0.03681,0.03681,0,0.07362,0.07362,0.07362,-0.03681,0.07362,0.18405,0.03681,-0.03681,0.14724,-0.07362,0,0.03681]'::vector(64), 2
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 33, 'Chapter 2: Genetics', 'Mendelian Inheritance and Meiotic Recombination', 'Genetics', 'Mendel Law of Segregation states that allele pairs separate during gamete formation in meiosis I, while the Law of Independent Assortment applies to unlinked genes located on different homologous chromosomes. Crossing over occurs during prophase I at chiasmata between non-sister chromatids of homologous chromosomes, generating recombinant chromatids and genetic variation.', '[0,-0.09054,0.22634,-0.09054,0.09054,0.04527,0.04527,0,0.18107,0,0.09054,-0.31688,0.1358,0.04527,0.1358,-0.04527,0,-0.27161,0.1358,0,0.22634,0.04527,0.09054,0.09054,0.09054,-0.09054,0.09054,-0.09054,0.04527,0,0.04527,-0.1358,0,-0.27161,0.09054,-0.09054,0.09054,0.04527,0.31688,-0.09054,0.1358,0.04527,0.1358,-0.18107,0.1358,0.04527,0.04527,-0.18107,0,0,0.18107,0,0.22634,0.04527,0,0,0.1358,0.1358,0,-0.04527,0.22634,0,0.09054,0]'::vector(64), 3
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 42, 'Chapter 3: Photosynthesis', 'Light-Dependent Reactions in the Thylakoid', 'Photosynthesis', 'Light-dependent reactions take place strictly within the thylakoid membrane of chloroplasts. Photon absorption excites electrons in Photosystem II (P680), triggering photolysis of water (H2O -> 2H+ + 1/2 O2 + 2e-) in the thylakoid lumen. Electrons travel through plastoquinone, the cytochrome b6f complex (which pumps protons into the thylakoid lumen to drive ATP synthase via chemiosmosis), and Photosystem I (P700), where NADP+ reductase reduces NADP+ to NADPH.', '[0.18964,0.03161,0.03161,0,0.12643,0,0.15803,0,0.03161,0,0.03161,-0.03161,0,-0.09482,0.18964,0.03161,0.28446,-0.18964,0.03161,-0.06321,0.09482,-0.06321,0.18964,0.03161,0.09482,-0.06321,0.15803,-0.09482,0.12643,-0.03161,0.06321,0,0,0.03161,0.12643,-0.12643,0.63214,0,0.28446,0.03161,0.06321,0,0.12643,0.09482,0.06321,0,0.09482,0.15803,0.12643,0,0.03161,0,0,0,0,-0.06321,0.15803,0,0,0,0.06321,0,0.03161,0]'::vector(64), 4
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 45, 'Chapter 3: Photosynthesis', 'Calvin Cycle and Carbon Fixation in the Stroma', 'Photosynthesis', 'The light-independent reactions (Calvin cycle) occur in the chloroplast stroma, not in the thylakoid membrane. The enzyme RuBisCO catalyzes carbon fixation by attaching CO2 to ribulose-1,5-bisphosphate (RuBP, a 5-carbon acceptor) to form two molecules of 3-phosphoglycerate (3-PGA). Using ATP and NADPH generated by the light reactions, 3-PGA is reduced to glyceraldehyde-3-phosphate (G3P), and ATP is required to regenerate RuBP.', '[0.1291,0.06455,0.16137,0,0,0,0,-0.03227,0,0.03227,0.06455,0.03227,0,-0.09682,0.19365,-0.09682,0,-0.32275,0,0.03227,0.03227,0,0,-0.06455,0.16137,0,0.06455,-0.06455,0.2582,0,0,0.06455,0.06455,0.03227,0.19365,0.1291,0.5164,0.06455,0.19365,0,0.19365,0,0,-0.1291,0.06455,0,0.06455,0.06455,0.03227,0,0.06455,0.03227,0.19365,-0.1291,0,0,0.09682,-0.06455,0.03227,-0.3873,0.09682,0.06455,0.03227,0]'::vector(64), 5
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 54, 'Chapter 4: Respiration', 'Glycolysis and the Citric Acid (Krebs) Cycle', 'Respiration', 'Glycolysis occurs in the cytosol without requiring oxygen, converting one 6-carbon glucose molecule into two 3-carbon pyruvate molecules with a net yield of 2 ATP (via substrate-level phosphorylation) and 2 NADH. In aerobic conditions, pyruvate enters the mitochondrial matrix where pyruvate dehydrogenase oxidizes it to Acetyl-CoA, releasing CO2. The Krebs cycle in the mitochondrial matrix oxidizes Acetyl-CoA, producing 3 NADH, 1 FADH2, and 1 ATP (or GTP) per turn.', '[0.06347,0.03173,0.0952,0.03173,0.12694,0,0.06347,0.03173,0,-0.06347,0,0,0.12694,0.03173,0.15867,-0.06347,0.15867,-0.0952,0.03173,-0.12694,0.1904,0,0.03173,-0.06347,0.1904,0.06347,0,0,0.12694,0.03173,0.12694,-0.03173,0,-0.1904,0,-0.0952,0.50774,0.0952,0.25387,0.06347,0.22214,-0.12694,0.0952,-0.06347,0.28561,0.06347,0.31734,0,0.06347,0,0.0952,0,0.06347,0.0952,0,-0.0952,0.1904,-0.06347,0,0,0.06347,0.06347,0.03173,-0.12694]'::vector(64), 6
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 58, 'Chapter 4: Respiration', 'Electron Transport Chain and Oxidative Phosphorylation', 'Respiration', 'The Electron Transport Chain (ETC) is embedded in the inner mitochondrial membrane (cristae). NADH and FADH2 donate electrons to complexes I and II, pumping protons (H+) from the mitochondrial matrix into the intermembrane space to establish a proton-motive force. Oxygen (O2) serves as the final electron acceptor at Complex IV, combining with protons to form water. Protons flow back into the matrix through ATP synthase (chemiosmosis), generating approx. 26 to 28 ATP per glucose.', '[0.22537,0.08452,0.11269,0,0.14086,-0.05634,0.05634,-0.02817,0.02817,-0.11269,0.05634,-0.02817,0,-0.1972,0.1972,-0.05634,0.14086,0,0.02817,-0.11269,0.08452,0.05634,0.16903,0,0.08452,-0.02817,0.02817,0,0.08452,0.05634,0.05634,-0.02817,0,0.02817,0.14086,-0.02817,0.56344,-0.05634,0.47892,0.05634,0.11269,-0.05634,0.14086,-0.16903,0.11269,0.05634,0.14086,0.02817,0.05634,0,0.02817,-0.05634,0,0,0,-0.08452,0.11269,-0.05634,0,0,0.02817,0.02817,0.02817,-0.02817]'::vector(64), 7
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 71, 'Chapter 5: Human Physiology', 'Cardiac Cycle and Hemoglobin Oxygen Dissociation', 'Human Physiology', 'Cardiac contraction is myogenic, initiated by depolarization at the sinoatrial (SA) node in the right atrium, delayed at the atrioventricular (AV) node to allow complete atrial systole, and conducted rapidly along the Bundle of His and Purkinje fibers to trigger ventricular systole. In blood gas transport, elevated partial pressure of CO2 and lower pH in respiring tissues shift the hemoglobin oxygen dissociation curve to the right (the Bohr effect), promoting oxygen release to active tissues.', '[0.20687,0.02955,0.17732,-0.05911,0,0,0.05911,0,0,-0.17732,0.02955,0,0.05911,-0.02955,0.35463,-0.23642,0.08866,-0.11821,0,0.05911,0.05911,-0.11821,0,0,0.02955,0,0,-0.05911,0.17732,0.05911,0.20687,0.02955,0.05911,0,0.05911,0.05911,0.41374,-0.11821,0.35463,0.02955,0,0.08866,0.05911,0.05911,0.05911,0.11821,0.08866,0,0,-0.05911,0.29553,-0.14776,0,-0.05911,0.17732,0.02955,0.11821,-0.02955,0.08866,0,0.08866,0.02955,0.17732,0]'::vector(64), 8
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Biology_Textbook.pdf', 76, 'Chapter 5: Human Physiology', 'Nephron Ultrafiltration and Synaptic Transmission', 'Human Physiology', 'In the mammalian kidney nephron, high hydrostatic pressure in the glomerulus forces water, glucose, amino acids, and urea across the basement membrane into Bowman capsule (ultrafiltration), while selective reabsorption of 100% of glucose occurs in the proximal convoluted tubule via sodium-glucose cotransporters. At chemical synapses, arrival of an action potential opens voltage-gated Ca2+ channels in the presynaptic knob, causing exocytosis of acetylcholine vesicles into the synaptic cleft.', '[0.14089,-0.14089,0.10567,0,0,-0.07045,0.10567,0,0.07045,0,0,-0.10567,0,0.03522,0.35223,0,0.17612,0,0.07045,-0.07045,0.03522,-0.07045,0.03522,0.07045,0.17612,0,0.07045,-0.07045,0.17612,-0.03522,0.14089,-0.07045,0.07045,-0.07045,0,-0.21134,0.45791,-0.21134,0.14089,0.03522,0.14089,0.03522,0.07045,0.03522,0.28179,0.03522,0,0.03522,0.17612,-0.03522,0.07045,0.07045,0.14089,-0.07045,0,-0.17612,0.10567,-0.21134,0.07045,-0.10567,0.07045,0.03522,0.07045,-0.14089]'::vector(64), 9
) ON CONFLICT (id) DO NOTHING;

-- 5. Topics and Subtopics
INSERT INTO public.topics (
    id, student_id, subject_id, subject_name, unit_name, chapter_name, topic_name, important_concepts, prerequisites, syllabus_weight, past_paper_frequency, is_sample
) VALUES (
    '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Unit 1: Cellular Foundations', 'Chapter 1: Cell Biology', 'Cell Biology', '["Na+/K+ ATPase pump","Cholesterol membrane fluidity buffer","Lysosomal hydrolytic enzymes","Anaphase chromatid separation"]'::jsonb, '[]'::jsonb, 8, 4, true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Fluid Mosaic Model')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Active & Passive Membrane Transport')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Eukaryotic Organelles')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Mitotic Cell Cycle')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.topics (
    id, student_id, subject_id, subject_name, unit_name, chapter_name, topic_name, important_concepts, prerequisites, syllabus_weight, past_paper_frequency, is_sample
) VALUES (
    '40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Unit 2: Hereditary Mechanisms', 'Chapter 2: Genetics', 'Genetics', '["DNA Polymerase III 5-prime to 3-prime polarity","Okazaki fragments and DNA ligase","Prophase I chiasmata crossing over","Independent assortment of unlinked loci"]'::jsonb, '["Cell Biology"]'::jsonb, 9, 5, true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Semiconservative DNA Replication')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Leading vs Lagging Strand Synthesis')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Transcription and mRNA Splicing')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Meiotic Recombination & Mendelian Laws')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.topics (
    id, student_id, subject_id, subject_name, unit_name, chapter_name, topic_name, important_concepts, prerequisites, syllabus_weight, past_paper_frequency, is_sample
) VALUES (
    '40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Unit 3: Cellular Energetics', 'Chapter 3: Photosynthesis', 'Photosynthesis', '["Photosystem II (P680) and Photosystem I (P700)","RuBisCO carboxylation of RuBP to 3-PGA","Thylakoid lumen proton gradient","G3P reduction using ATP and NADPH"]'::jsonb, '["Cell Biology"]'::jsonb, 10, 7, true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Light-Dependent Reactions (Thylakoid)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Photolysis of Water at Photosystem II')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Chemiosmotic Photophosphorylation')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Calvin Cycle Carbon Fixation (Stroma)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.topics (
    id, student_id, subject_id, subject_name, unit_name, chapter_name, topic_name, important_concepts, prerequisites, syllabus_weight, past_paper_frequency, is_sample
) VALUES (
    '40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Unit 3: Cellular Energetics', 'Chapter 4: Respiration', 'Respiration', '["Net 2 ATP yield in glycolysis","Intermembrane space proton-motive force","Oxygen as terminal electron acceptor at Complex IV","Mitochondrial matrix decarboxylation"]'::jsonb, '["Cell Biology"]'::jsonb, 9, 6, true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Cytosolic Glycolysis')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Pyruvate Oxidation & Krebs Cycle')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Inner Mitochondrial Membrane ETC')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Oxidative vs Substrate-Level Phosphorylation')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.topics (
    id, student_id, subject_id, subject_name, unit_name, chapter_name, topic_name, important_concepts, prerequisites, syllabus_weight, past_paper_frequency, is_sample
) VALUES (
    '40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology', 'Unit 4: Organismal Regulation', 'Chapter 5: Human Physiology', 'Human Physiology', '["AV node conduction delay","Rightward Bohr shift at high pCO2","Proximal convoluted tubule glucose cotransport","Voltage-gated Ca2+ influx at presynaptic terminal"]'::jsonb, '["Cell Biology","Respiration"]'::jsonb, 8, 5, true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Myogenic Cardiac Cycle & SA/AV Nodes')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Bohr Effect & Hemoglobin Dissociation')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Nephron Ultrafiltration & PCT Reabsorption')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('45000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Cholinergic Synaptic Transmission')
ON CONFLICT (id) DO NOTHING;

-- 6. Past Paper Questions
INSERT INTO public.past_paper_questions (
    id, student_id, document_id, topic_id, source_document, page_number, subject_name, topic_name, subtopic_name, question_text, year, marks, question_type, is_sample
) VALUES (
    '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'Biology_Past_Papers_2022_2025.pdf', 3, 'Biology', 'Photosynthesis', 'Calvin Cycle Carbon Fixation (Stroma)', 'Explain why carbon fixation in the Calvin cycle ceases rapidly in the dark even though neither RuBisCO nor CO2 requires direct light activation.', '2025', 4, 'ShortAnswer', true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.past_paper_questions (
    id, student_id, document_id, topic_id, source_document, page_number, subject_name, topic_name, subtopic_name, question_text, year, marks, question_type, is_sample
) VALUES (
    '50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'Biology_Past_Papers_2022_2025.pdf', 5, 'Biology', 'Photosynthesis', 'Light-Dependent Reactions (Thylakoid)', 'Describe the precise compartment where protons accumulate during non-cyclic photophosphorylation and state the role of photolysis in maintaining electron flow.', '2024', 3, 'ShortAnswer', true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.past_paper_questions (
    id, student_id, document_id, topic_id, source_document, page_number, subject_name, topic_name, subtopic_name, question_text, year, marks, question_type, is_sample
) VALUES (
    '50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'Biology_Past_Papers_2022_2025.pdf', 8, 'Biology', 'Respiration', 'Inner Mitochondrial Membrane ETC', 'Contrast the direction of proton pumping across the inner mitochondrial membrane in aerobic respiration with proton pumping across the thylakoid membrane in chloroplasts.', '2025', 4, 'ShortAnswer', true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.past_paper_questions (
    id, student_id, document_id, topic_id, source_document, page_number, subject_name, topic_name, subtopic_name, question_text, year, marks, question_type, is_sample
) VALUES (
    '50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'Biology_Past_Papers_2022_2025.pdf', 11, 'Biology', 'Respiration', 'Oxidative vs Substrate-Level Phosphorylation', 'Identify which stages of cellular respiration generate ATP via substrate-level phosphorylation when cyanide inhibits Complex IV of the electron transport chain.', '2023', 3, 'MCQ', true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.past_paper_questions (
    id, student_id, document_id, topic_id, source_document, page_number, subject_name, topic_name, subtopic_name, question_text, year, marks, question_type, is_sample
) VALUES (
    '50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'Biology_Past_Papers_2022_2025.pdf', 14, 'Biology', 'Genetics', 'Leading vs Lagging Strand Synthesis', 'Explain why DNA polymerase III synthesizes the lagging strand discontinuously as Okazaki fragments rather than continuously toward the replication fork.', '2024', 3, 'ShortAnswer', true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.past_paper_questions (
    id, student_id, document_id, topic_id, source_document, page_number, subject_name, topic_name, subtopic_name, question_text, year, marks, question_type, is_sample
) VALUES (
    '50000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', 'Biology_Past_Papers_2022_2025.pdf', 17, 'Biology', 'Human Physiology', 'Bohr Effect & Hemoglobin Dissociation', 'Analyze how intense muscular exercise alters the pH of capillary blood and shifts the hemoglobin oxygen dissociation curve.', '2025', 4, 'ShortAnswer', true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.past_paper_questions (
    id, student_id, document_id, topic_id, source_document, page_number, subject_name, topic_name, subtopic_name, question_text, year, marks, question_type, is_sample
) VALUES (
    '50000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'Biology_Past_Papers_2022_2025.pdf', 20, 'Biology', 'Cell Biology', 'Active & Passive Membrane Transport', 'Distinguish between facilitated diffusion through channel proteins and primary active transport via the Na+/K+ pump.', '2022', 3, 'ShortAnswer', true
) ON CONFLICT (id) DO NOTHING;

-- 7. Diagnostic Quizzes, Quiz Questions, and Student Answers (Preserving All Attempts)
INSERT INTO public.quizzes (
    id, student_id, subject_id, title, subject_name, selected_topics, difficulty, time_limit_minutes, status, total_score, max_score, accuracy_percent, duration_seconds, is_sample, created_at, completed_at
) VALUES (
    '60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Biology Baseline Diagnostic Assessment #1', 'Biology', '["Cell Biology","Genetics","Photosynthesis","Respiration","Human Physiology"]'::jsonb, 'Mixed', 15, 'Completed', 1, 4, 42, 480, true, '2026-11-06T14:00:00.000Z', '2026-11-06T14:08:00.000Z'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Cell Biology', 'Active & Passive Membrane Transport', 'MCQ', 'Easy', 'Which transport mechanism directly requires ATP hydrolysis to move sodium ions out of the cell against their concentration gradient?', '["Facilitated diffusion via aquaporins","Primary active transport via the Na+/K+ ATPase pump","Simple diffusion across the hydrophobic core","Osmosis across a selectively permeable membrane"]'::jsonb, 'Primary active transport via the Na+/K+ ATPase pump', 1, 'The Na+/K+ ATPase pump uses ATP hydrolysis to actively transport ions against their electrochemical gradient.', 'chunk_bio_01', 'Biology_Textbook.pdf', 'Chapter 1: Cell Biology', 14, 'Fluid Mosaic Model and Membrane Transport', 'active transport uses ATP hydrolysis (such as the Na+/K+ ATPase pump) to move ions against their electrochemical gradient.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'Photosynthesis', 'Calvin Cycle Carbon Fixation (Stroma)', 'MCQ', 'Medium', 'Where in the chloroplast does RuBisCO catalyze the fixation of carbon dioxide onto RuBP?', '["Within the thylakoid lumen","Embedded in the inner mitochondrial cristae","In the chloroplast stroma","In the cytosolic space outside the outer membrane"]'::jsonb, 'In the chloroplast stroma', 1, 'The Calvin cycle and RuBisCO carbon fixation take place in the aqueous stroma of the chloroplast.', 'chunk_bio_06', 'Biology_Textbook.pdf', 'Chapter 3: Photosynthesis', 45, 'Calvin Cycle and Carbon Fixation in the Stroma', 'The light-independent reactions (Calvin cycle) occur in the chloroplast stroma, not in the thylakoid membrane.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'Respiration', 'Inner Mitochondrial Membrane ETC', 'MCQ', 'Medium', 'During aerobic oxidative phosphorylation, protons (H+) are pumped by the electron transport chain into which compartment?', '["Into the cytosol","Into the mitochondrial intermembrane space","Into the thylakoid lumen","Into the nucleoplasm"]'::jsonb, 'Into the mitochondrial intermembrane space', 1, 'Complexes I, III, and IV pump protons from the mitochondrial matrix into the intermembrane space.', 'chunk_bio_08', 'Biology_Textbook.pdf', 'Chapter 4: Respiration', 58, 'Electron Transport Chain and Oxidative Phosphorylation', 'pumping protons (H+) from the mitochondrial matrix into the intermembrane space to establish a proton-motive force.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'Genetics', 'Leading vs Lagging Strand Synthesis', 'TrueFalse', 'Medium', 'True or False: DNA polymerase III can initiate a new polynucleotide strand de novo without requiring an existing 3-prime OH primer.', '["True","False"]'::jsonb, 'False', 1, 'DNA polymerase III requires an RNA primer synthesized by primase to provide a free 3-prime OH group.', 'chunk_bio_03', 'Biology_Textbook.pdf', 'Chapter 2: Genetics', 28, 'DNA Replication and Transcription-Translation', 'primase to synthesize an RNA primer, and DNA polymerase III to add deoxynucleotides exclusively in the 5-prime to 3-prime direction.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Cell Biology', 'Active & Passive Membrane Transport', 'Primary active transport via the Na+/K+ ATPase pump', 'Primary active transport via the Na+/K+ ATPase pump', true, 1, 1, 'Correctly identified ATP-driven primary active transport.', 'Easy'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Photosynthesis', 'Calvin Cycle Carbon Fixation (Stroma)', 'Within the thylakoid lumen', 'In the chloroplast stroma', false, 0, 1, 'Incorrect. You confused the thylakoid lumen (site of photolysis and proton accumulation in light reactions) with the stroma (site of the Calvin cycle).', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Respiration', 'Inner Mitochondrial Membrane ETC', 'Into the cytosol', 'Into the mitochondrial intermembrane space', false, 0, 1, 'Incorrect. The ETC is in the inner mitochondrial membrane and pumps H+ into the intermembrane space, not the cytosol.', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Genetics', 'Leading vs Lagging Strand Synthesis', 'True', 'False', false, 0, 1, 'Incorrect. DNA polymerase III cannot synthesize de novo; it requires an RNA primer made by primase.', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quizzes (
    id, student_id, subject_id, title, subject_name, selected_topics, difficulty, time_limit_minutes, status, total_score, max_score, accuracy_percent, duration_seconds, is_sample, created_at, completed_at
) VALUES (
    '60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cellular & Molecular Checkpoint Quiz #2', 'Biology', '["Cell Biology","Genetics","Photosynthesis","Human Physiology"]'::jsonb, 'Medium', 15, 'Completed', 3, 5, 56, 530, true, '2026-11-08T16:30:00.000Z', '2026-11-08T16:39:00.000Z'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Cell Biology', 'Eukaryotic Organelles', 'MCQ', 'Medium', 'Which organelle maintains an acidic internal pH (~4.8) to support hydrolytic enzymes for intracellular digestion?', '["Golgi apparatus","Lysosome","Peroxisome","Smooth endoplasmic reticulum"]'::jsonb, 'Lysosome', 1, 'Lysosomes contain acid hydrolases that function optimally at pH ~4.8.', 'chunk_bio_02', 'Biology_Textbook.pdf', 'Chapter 1: Cell Biology', 19, 'Eukaryotic Organelles and Mitotic Cell Division', 'lysosomes perform intracellular digestion using hydrolytic enzymes at acidic pH (approx. 4.8).'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Genetics', 'Meiotic Recombination & Mendelian Laws', 'MCQ', 'Medium', 'During which stage of meiosis do non-sister chromatids of homologous chromosomes exchange genetic segments at chiasmata?', '["Prophase I","Metaphase I","Anaphase II","Telophase I"]'::jsonb, 'Prophase I', 1, 'Synapsis and crossing over at chiasmata occur during Prophase I of meiosis.', 'chunk_bio_04', 'Biology_Textbook.pdf', 'Chapter 2: Genetics', 33, 'Mendelian Inheritance and Meiotic Recombination', 'Crossing over occurs during prophase I at chiasmata between non-sister chromatids of homologous chromosomes.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 'Photosynthesis', 'Light-Dependent Reactions (Thylakoid)', 'ShortAnswer', 'Hard', 'State the specific role of NADP+ and ATP produced in the thylakoid reactions and identify which stage consumes them.', NULL, 'ATP provides chemical energy for phosphorylation and RuBP regeneration, while NADPH provides reducing power (electrons) to reduce 3-PGA to G3P in the Calvin cycle in the stroma.', 2, 'The light reactions produce ATP and NADPH, which are consumed in the stroma during the Calvin cycle to reduce 3-PGA into G3P and regenerate RuBP.', 'chunk_bio_06', 'Biology_Textbook.pdf', 'Chapter 3: Photosynthesis', 45, 'Calvin Cycle and Carbon Fixation in the Stroma', 'Using ATP and NADPH generated by the light reactions, 3-PGA is reduced to glyceraldehyde-3-phosphate (G3P), and ATP is required to regenerate RuBP.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000008', '60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000005', 'Human Physiology', 'Bohr Effect & Hemoglobin Dissociation', 'MCQ', 'Medium', 'How does an increase in blood CO2 concentration affect the hemoglobin oxygen dissociation curve?', '["Shifts the curve to the right, decreasing hemoglobin affinity for O2 to unload more oxygen to tissues","Shifts the curve to the left, locking oxygen onto hemoglobin","Eliminates the sigmoidal cooperativity of hemoglobin","Increases blood pH and prevents oxygen release"]'::jsonb, 'Shifts the curve to the right, decreasing hemoglobin affinity for O2 to unload more oxygen to tissues', 1, 'The Bohr effect describes a rightward shift of the dissociation curve at elevated CO2 and lower pH, enhancing O2 delivery.', 'chunk_bio_09', 'Biology_Textbook.pdf', 'Chapter 5: Human Physiology', 71, 'Cardiac Cycle and Hemoglobin Oxygen Dissociation', 'elevated partial pressure of CO2 and lower pH in respiring tissues shift the hemoglobin oxygen dissociation curve to the right (the Bohr effect), promoting oxygen release to active tissues.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Cell Biology', 'Eukaryotic Organelles', 'Lysosome', 'Lysosome', true, 1, 1, 'Correct.', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Genetics', 'Meiotic Recombination & Mendelian Laws', 'Prophase I', 'Prophase I', true, 1, 1, 'Correct.', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Photosynthesis', 'Light-Dependent Reactions (Thylakoid)', 'ATP and NADPH are used to split water during photolysis in the light reactions.', 'ATP provides chemical energy for phosphorylation and RuBP regeneration, while NADPH provides reducing power (electrons) to reduce 3-PGA to G3P in the Calvin cycle in the stroma.', false, 0, 2, 'Incorrect. Photolysis of water is driven by light energy at Photosystem II and produces electrons, protons, and O2. ATP and NADPH are products of the light reactions that are consumed in the Calvin cycle.', 'Hard'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000008', '60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Human Physiology', 'Bohr Effect & Hemoglobin Dissociation', 'Shifts the curve to the right, decreasing hemoglobin affinity for O2 to unload more oxygen to tissues', 'Shifts the curve to the right, decreasing hemoglobin affinity for O2 to unload more oxygen to tissues', true, 1, 1, 'Correct analysis of the Bohr effect.', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quizzes (
    id, student_id, subject_id, title, subject_name, selected_topics, difficulty, time_limit_minutes, status, total_score, max_score, accuracy_percent, duration_seconds, is_sample, created_at, completed_at
) VALUES (
    '60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Comprehensive Biology Diagnostic Assessment #3', 'Biology', '["Cell Biology","Genetics","Photosynthesis","Respiration","Human Physiology"]'::jsonb, 'Mixed', 20, 'Completed', 4, 6, 67, 615, true, '2026-11-11T10:15:00.000Z', '2026-11-11T10:25:15.000Z'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'Photosynthesis', 'Photolysis of Water at Photosystem II', 'MCQ', 'Medium', 'What is the direct source of replacement electrons for reaction-center chlorophyll P680 in Photosystem II?', '["Oxidation of NADPH in the stroma","Photolysis (splitting) of water molecules in the thylakoid lumen","Decarboxylation of RuBP by RuBisCO","Cyclic electron flow from Photosystem I"]'::jsonb, 'Photolysis (splitting) of water molecules in the thylakoid lumen', 1, 'Photolysis of water in the thylakoid lumen supplies replacement electrons to P680+ in Photosystem II and releases O2.', 'chunk_bio_05', 'Biology_Textbook.pdf', 'Chapter 3: Photosynthesis', 42, 'Light-Dependent Reactions in the Thylakoid', 'Photon absorption excites electrons in Photosystem II (P680), triggering photolysis of water (H2O -> 2H+ + 1/2 O2 + 2e-) in the thylakoid lumen.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'Respiration', 'Cytosolic Glycolysis', 'FillBlank', 'Medium', 'In anaerobic or aerobic conditions, glycolysis occurs in the ________ and produces a net gain of 2 ATP molecules per glucose by substrate-level phosphorylation.', NULL, 'cytosol', 1, 'Glycolysis takes place in the cytosol (cytoplasm) without requiring oxygen.', 'chunk_bio_07', 'Biology_Textbook.pdf', 'Chapter 4: Respiration', 54, 'Glycolysis and the Citric Acid (Krebs) Cycle', 'Glycolysis occurs in the cytosol without requiring oxygen, converting one 6-carbon glucose molecule into two 3-carbon pyruvate molecules with a net yield of 2 ATP.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'Respiration', 'Inner Mitochondrial Membrane ETC', 'MCQ', 'Hard', 'Which molecule acts as the terminal electron acceptor at Complex IV of the mitochondrial electron transport chain?', '["NAD+","FAD","Molecular oxygen (O2)","Pyruvate"]'::jsonb, 'Molecular oxygen (O2)', 1, 'Oxygen (O2) accepts electrons at the end of the ETC (Complex IV) and combines with H+ to form H2O.', 'chunk_bio_08', 'Biology_Textbook.pdf', 'Chapter 4: Respiration', 58, 'Electron Transport Chain and Oxidative Phosphorylation', 'Oxygen (O2) serves as the final electron acceptor at Complex IV, combining with protons to form water.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000012', '60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'Cell Biology', 'Fluid Mosaic Model', 'MCQ', 'Easy', 'Which component of the animal plasma membrane acts as a bidirectional fluidity buffer across high and low temperatures?', '["Cholesterol","Glycogen granules","Cellulose microfibrils","Peptidoglycan"]'::jsonb, 'Cholesterol', 1, 'Cholesterol molecules wedged between phospholipids restrain movement at warm temperatures and prevent tight packing at cold temperatures.', 'chunk_bio_01', 'Biology_Textbook.pdf', 'Chapter 1: Cell Biology', 14, 'Fluid Mosaic Model and Membrane Transport', 'amphipathic phospholipids, cholesterol molecules that buffer fluidity across temperatures, and integral transmembrane proteins.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000013', '60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'Genetics', 'Leading vs Lagging Strand Synthesis', 'MCQ', 'Medium', 'Which enzyme seals the sugar-phosphate nick between adjacent Okazaki fragments on the lagging strand after primer replacement?', '["DNA helicase","DNA ligase","RNA primase","Topoisomerase"]'::jsonb, 'DNA ligase', 1, 'DNA ligase catalyzes phosphodiester bond formation to join Okazaki fragments.', 'chunk_bio_03', 'Biology_Textbook.pdf', 'Chapter 2: Genetics', 28, 'DNA Replication and Transcription-Translation', 'the lagging strand is synthesized discontinuously as Okazaki fragments later sealed by DNA ligase.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '70000000-0000-0000-0000-000000000014', '60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', 'Human Physiology', 'Nephron Ultrafiltration & PCT Reabsorption', 'MCQ', 'Medium', 'In a healthy mammalian nephron, where is 100% of filtered glucose selectively reabsorbed into the peritubular capillaries?', '["Descending limb of the Loop of Henle","Proximal convoluted tubule (PCT)","Distal convoluted tubule","Collecting duct"]'::jsonb, 'Proximal convoluted tubule (PCT)', 1, 'Selective reabsorption of all filtered glucose and amino acids occurs in the proximal convoluted tubule via sodium-glucose cotransporters.', 'chunk_bio_10', 'Biology_Textbook.pdf', 'Chapter 5: Human Physiology', 76, 'Nephron Ultrafiltration and Synaptic Transmission', 'selective reabsorption of 100% of glucose occurs in the proximal convoluted tubule via sodium-glucose cotransporters.'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'Photosynthesis', 'Photolysis of Water at Photosystem II', 'Oxidation of NADPH in the stroma', 'Photolysis (splitting) of water molecules in the thylakoid lumen', false, 0, 1, 'Incorrect. NADPH is produced at the end of the light-dependent reactions and oxidized in the Calvin cycle. Photolysis of water supplies electrons to Photosystem II.', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Respiration', 'Cytosolic Glycolysis', 'mitochondrial matrix', 'cytosol', false, 0, 1, 'Incorrect. Glycolysis takes place in the cytosol; only pyruvate oxidation and the Krebs cycle occur in the mitochondrial matrix.', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Respiration', 'Inner Mitochondrial Membrane ETC', 'Molecular oxygen (O2)', 'Molecular oxygen (O2)', true, 1, 1, 'Correct.', 'Hard'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000012', '60000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Cell Biology', 'Fluid Mosaic Model', 'Cholesterol', 'Cholesterol', true, 1, 1, 'Correct.', 'Easy'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000013', '60000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Genetics', 'Leading vs Lagging Strand Synthesis', 'DNA ligase', 'DNA ligase', true, 1, 1, 'Correct.', 'Medium'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '75000000-0000-0000-0000-000000000014', '60000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'Human Physiology', 'Nephron Ultrafiltration & PCT Reabsorption', 'Proximal convoluted tubule (PCT)', 'Proximal convoluted tubule (PCT)', true, 1, 1, 'Correct.', 'Medium'
) ON CONFLICT (id) DO NOTHING;

-- 8. Topic Performance
INSERT INTO public.topic_performance (
    id, student_id, topic_id, topic_name, questions_attempted, correct_count, incorrect_count, accuracy_percent, repeated_mistakes_count, hard_or_medium_count
) VALUES (
    '78000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Cell Biology', 6, 5, 1, 83, 0, 4
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    accuracy_percent = EXCLUDED.accuracy_percent,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    hard_or_medium_count = EXCLUDED.hard_or_medium_count;
INSERT INTO public.topic_performance (
    id, student_id, topic_id, topic_name, questions_attempted, correct_count, incorrect_count, accuracy_percent, repeated_mistakes_count, hard_or_medium_count
) VALUES (
    '78000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'Genetics', 6, 4, 2, 67, 1, 5
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    accuracy_percent = EXCLUDED.accuracy_percent,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    hard_or_medium_count = EXCLUDED.hard_or_medium_count;
INSERT INTO public.topic_performance (
    id, student_id, topic_id, topic_name, questions_attempted, correct_count, incorrect_count, accuracy_percent, repeated_mistakes_count, hard_or_medium_count
) VALUES (
    '78000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'Photosynthesis', 7, 2, 5, 29, 3, 6
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    accuracy_percent = EXCLUDED.accuracy_percent,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    hard_or_medium_count = EXCLUDED.hard_or_medium_count;
INSERT INTO public.topic_performance (
    id, student_id, topic_id, topic_name, questions_attempted, correct_count, incorrect_count, accuracy_percent, repeated_mistakes_count, hard_or_medium_count
) VALUES (
    '78000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'Respiration', 7, 3, 4, 43, 2, 6
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    accuracy_percent = EXCLUDED.accuracy_percent,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    hard_or_medium_count = EXCLUDED.hard_or_medium_count;
INSERT INTO public.topic_performance (
    id, student_id, topic_id, topic_name, questions_attempted, correct_count, incorrect_count, accuracy_percent, repeated_mistakes_count, hard_or_medium_count
) VALUES (
    '78000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 'Human Physiology', 6, 4, 2, 67, 0, 5
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    accuracy_percent = EXCLUDED.accuracy_percent,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    hard_or_medium_count = EXCLUDED.hard_or_medium_count;

-- 9. Knowledge Gap Reports
INSERT INTO public.gap_reports (
    id, student_id, subject_name, topic_name, unit_name, status, accuracy_percent, questions_attempted, correct_count, incorrect_count, confidence_level, repeated_mistakes_count, trend_delta, previous_status, common_mistakes_reason, recommended_action, past_paper_frequency, priority_score, citations, is_sample, updated_at
) VALUES (
    '79000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Biology', 'Photosynthesis', 'Unit 3: Cellular Energetics', 'Weak', 35, 7, 2, 5, 'High', 3, -4, 'Weak', 'The student repeatedly confused light-dependent reactions in the thylakoid membrane with carbon fixation in the Calvin cycle (stroma), and reversed the roles of photolysis and NADPH.', 'Revise the light-dependent pathway on Page 42 of Biology_Textbook.pdf and map where ATP and NADPH are synthesized versus consumed in the Calvin cycle (Page 45).', 7, 95, '[{"chunkId":"chunk_bio_05","documentName":"Biology_Textbook.pdf","chapter":"Chapter 3: Photosynthesis","pageNumber":42,"section":"Light-Dependent Reactions in the Thylakoid","excerpt":"Light-dependent reactions take place strictly within the thylakoid membrane of chloroplasts. Photon absorption excites electrons in Photosystem II (P680), triggering photolysis of water."},{"chunkId":"chunk_bio_06","documentName":"Biology_Textbook.pdf","chapter":"Chapter 3: Photosynthesis","pageNumber":45,"section":"Calvin Cycle and Carbon Fixation in the Stroma","excerpt":"The light-independent reactions (Calvin cycle) occur in the chloroplast stroma, not in the thylakoid membrane. RuBisCO catalyzes carbon fixation."}]'::jsonb, true, '2026-11-11T10:25:15.000Z'
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    status = EXCLUDED.status,
    accuracy_percent = EXCLUDED.accuracy_percent,
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    confidence_level = EXCLUDED.confidence_level,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    trend_delta = EXCLUDED.trend_delta,
    common_mistakes_reason = EXCLUDED.common_mistakes_reason,
    recommended_action = EXCLUDED.recommended_action,
    priority_score = EXCLUDED.priority_score,
    citations = EXCLUDED.citations;
INSERT INTO public.gap_reports (
    id, student_id, subject_name, topic_name, unit_name, status, accuracy_percent, questions_attempted, correct_count, incorrect_count, confidence_level, repeated_mistakes_count, trend_delta, previous_status, common_mistakes_reason, recommended_action, past_paper_frequency, priority_score, citations, is_sample, updated_at
) VALUES (
    '79000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Biology', 'Respiration', 'Unit 3: Cellular Energetics', 'Weak', 43, 7, 3, 4, 'High', 2, 5, 'Weak', 'The student misidentified the cellular compartment of glycolysis (cytosol vs mitochondrial matrix) and confused proton pumping into the intermembrane space.', 'Create a compartment comparison table for Glycolysis (cytosol), Krebs Cycle (matrix), and ETC (inner mitochondrial membrane) from Pages 54-58.', 6, 86, '[{"chunkId":"chunk_bio_07","documentName":"Biology_Textbook.pdf","chapter":"Chapter 4: Respiration","pageNumber":54,"section":"Glycolysis and the Citric Acid (Krebs) Cycle","excerpt":"Glycolysis occurs in the cytosol without requiring oxygen, converting one 6-carbon glucose molecule into two 3-carbon pyruvate molecules."},{"chunkId":"chunk_bio_08","documentName":"Biology_Textbook.pdf","chapter":"Chapter 4: Respiration","pageNumber":58,"section":"Electron Transport Chain and Oxidative Phosphorylation","excerpt":"The Electron Transport Chain (ETC) is embedded in the inner mitochondrial membrane (cristae). NADH and FADH2 donate electrons to complexes I and II."}]'::jsonb, true, '2026-11-11T10:25:15.000Z'
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    status = EXCLUDED.status,
    accuracy_percent = EXCLUDED.accuracy_percent,
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    confidence_level = EXCLUDED.confidence_level,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    trend_delta = EXCLUDED.trend_delta,
    common_mistakes_reason = EXCLUDED.common_mistakes_reason,
    recommended_action = EXCLUDED.recommended_action,
    priority_score = EXCLUDED.priority_score,
    citations = EXCLUDED.citations;
INSERT INTO public.gap_reports (
    id, student_id, subject_name, topic_name, unit_name, status, accuracy_percent, questions_attempted, correct_count, incorrect_count, confidence_level, repeated_mistakes_count, trend_delta, previous_status, common_mistakes_reason, recommended_action, past_paper_frequency, priority_score, citations, is_sample, updated_at
) VALUES (
    '79000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Biology', 'Genetics', 'Unit 2: Hereditary Mechanisms', 'Medium', 64, 6, 4, 2, 'High', 1, 24, 'Weak', 'Initial confusion around RNA primer requirement for DNA Polymerase III was resolved in Attempt 3, though independent assortment vs linkage still needs practice.', 'Practice dihybrid cross and lagging strand replication problems from Chapter 2 (Pages 28-33).', 5, 62, '[{"chunkId":"chunk_bio_03","documentName":"Biology_Textbook.pdf","chapter":"Chapter 2: Genetics","pageNumber":28,"section":"DNA Replication and Transcription-Translation","excerpt":"Semiconservative DNA replication requires helicase to unwind the double helix at the replication fork, primase to synthesize an RNA primer."}]'::jsonb, true, '2026-11-11T10:25:15.000Z'
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    status = EXCLUDED.status,
    accuracy_percent = EXCLUDED.accuracy_percent,
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    confidence_level = EXCLUDED.confidence_level,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    trend_delta = EXCLUDED.trend_delta,
    common_mistakes_reason = EXCLUDED.common_mistakes_reason,
    recommended_action = EXCLUDED.recommended_action,
    priority_score = EXCLUDED.priority_score,
    citations = EXCLUDED.citations;
INSERT INTO public.gap_reports (
    id, student_id, subject_name, topic_name, unit_name, status, accuracy_percent, questions_attempted, correct_count, incorrect_count, confidence_level, repeated_mistakes_count, trend_delta, previous_status, common_mistakes_reason, recommended_action, past_paper_frequency, priority_score, citations, is_sample, updated_at
) VALUES (
    '79000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Biology', 'Human Physiology', 'Unit 4: Organismal Regulation', 'Medium', 67, 6, 4, 2, 'High', 0, 12, 'Medium', 'Solid grasp of the Bohr shift and PCT glucose reabsorption; minor errors on AV node conduction delay timing during the cardiac cycle.', 'Review SA and AV node action potential propagation on Page 71 and complete timed short-answer questions.', 5, 58, '[{"chunkId":"chunk_bio_09","documentName":"Biology_Textbook.pdf","chapter":"Chapter 5: Human Physiology","pageNumber":71,"section":"Cardiac Cycle and Hemoglobin Oxygen Dissociation","excerpt":"Cardiac contraction is myogenic, initiated by depolarization at the sinoatrial (SA) node in the right atrium, delayed at the atrioventricular (AV) node."}]'::jsonb, true, '2026-11-11T10:25:15.000Z'
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    status = EXCLUDED.status,
    accuracy_percent = EXCLUDED.accuracy_percent,
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    confidence_level = EXCLUDED.confidence_level,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    trend_delta = EXCLUDED.trend_delta,
    common_mistakes_reason = EXCLUDED.common_mistakes_reason,
    recommended_action = EXCLUDED.recommended_action,
    priority_score = EXCLUDED.priority_score,
    citations = EXCLUDED.citations;
INSERT INTO public.gap_reports (
    id, student_id, subject_name, topic_name, unit_name, status, accuracy_percent, questions_attempted, correct_count, incorrect_count, confidence_level, repeated_mistakes_count, trend_delta, previous_status, common_mistakes_reason, recommended_action, past_paper_frequency, priority_score, citations, is_sample, updated_at
) VALUES (
    '79000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Biology', 'Cell Biology', 'Unit 1: Cellular Foundations', 'Strong', 83, 6, 5, 1, 'High', 0, 18, 'Medium', 'High mastery of fluid mosaic membrane structure, active transport, and organelle compartmentalization.', 'Maintain retention with brief weekly spaced-repetition review while prioritizing Photosynthesis and Respiration.', 4, 28, '[{"chunkId":"chunk_bio_01","documentName":"Biology_Textbook.pdf","chapter":"Chapter 1: Cell Biology","pageNumber":14,"section":"Fluid Mosaic Model and Membrane Transport","excerpt":"The plasma membrane is described by the fluid mosaic model as a dynamic phospholipid bilayer with amphipathic phospholipids."}]'::jsonb, true, '2026-11-11T10:25:15.000Z'
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    status = EXCLUDED.status,
    accuracy_percent = EXCLUDED.accuracy_percent,
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    confidence_level = EXCLUDED.confidence_level,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    trend_delta = EXCLUDED.trend_delta,
    common_mistakes_reason = EXCLUDED.common_mistakes_reason,
    recommended_action = EXCLUDED.recommended_action,
    priority_score = EXCLUDED.priority_score,
    citations = EXCLUDED.citations;

-- 10. Revision Plan and Tasks
INSERT INTO public.revision_plans (
    id, student_id, subject_name, exam_date, days_available, daily_hours, priority_subjects, version, change_summary, is_sample, created_at
) VALUES (
    '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Biology', '2026-11-18', 5, 2, '["Biology"]'::jsonb, 2, '["Elevated Photosynthesis to Day 1 Critical Priority due to 35% accuracy and highest past-paper frequency (7 appearances).","Scheduled Respiration compartment comparison on Day 2 to resolve cytosol vs mitochondrial matrix errors.","Reduced Cell Biology allocation to maintenance review after accuracy improved from 65% to 83% (Strong).","Promoted Genetics from Weak (40%) to Medium (64%) after mastering Okazaki fragment ligation in Quiz #3."]'::jsonb, true, '2026-11-11T10:30:00.000Z'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'Day 1 (Nov 13)', 'Photosynthesis', 'Biology', 'Concept Revision', 'Thylakoid Light Reactions vs Stroma Calvin Cycle Mapping', 60, 'Critical', '["Trace electron flow from H2O photolysis at PSII (P680) to NADP+ reductase at PSI (P700).","Distinguish thylakoid lumen chemiosmosis from RuBisCO carbon fixation in the stroma."]'::jsonb, '["Explain why Calvin cycle carbon fixation stops immediately when light is removed.","State the exact source of electrons that reduce P680+ in Photosystem II."]'::jsonb, true, 'Weak status (35% accuracy, 5/7 incorrect) + #1 most tested topic in past papers.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'Day 1 (Nov 13)', 'Photosynthesis', 'Biology', 'Practice Questions', 'Past Paper Drill: Non-Cyclic Photophosphorylation & RuBP', 30, 'High', '["Solve 4 structured past-paper questions from 2024-2025 exams."]'::jsonb, '["Complete diagnostic practice set on Chapter 3 (Pages 42-45)."]'::jsonb, true, 'Verifies active recall immediately following concept consolidation.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'Day 1 (Nov 13)', 'Photosynthesis', 'Biology', 'Mistake Review', 'Error Correction: Stroma vs Thylakoid Lumen Misconceptions', 30, 'High', '["Rewrite incorrect answers from Quiz #1 and Quiz #3 using textbook citations."]'::jsonb, '["Contrast the role of NADPH in the stroma with photolysis in the lumen."]'::jsonb, false, 'Targets repeated mistake detected across 3 consecutive questions.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 2, 'Day 2 (Nov 14)', 'Respiration', 'Biology', 'Concept Revision', 'Glycolysis, Krebs Cycle & Inner Mitochondrial Membrane ETC', 60, 'Critical', '["Map cellular locations: Glycolysis (cytosol), Link & Krebs (matrix), ETC (cristae).","Compare substrate-level phosphorylation with chemiosmotic oxidative phosphorylation."]'::jsonb, '["Explain how proton pumping into the intermembrane space drives ATP synthase."]'::jsonb, false, 'Weak status (43% accuracy) and 6 appearances in past examination papers.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 2, 'Day 2 (Nov 14)', 'Respiration', 'Biology', 'Practice Questions', 'Practice Questions: Electron Transport Chain Inhibitors & ATP Yield', 30, 'High', '["Analyze the effect of Complex IV inhibition on NADH oxidation."]'::jsonb, '["Answer 2023 and 2025 past-paper questions on oxidative phosphorylation."]'::jsonb, false, 'High-weight exam topic requiring quantitative and mechanistic accuracy.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000006', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 2, 'Day 2 (Nov 14)', 'Respiration', 'Biology', 'Mistake Review', 'Review Mistakes: Cytosolic vs Mitochondrial Matrix Reactions', 30, 'Medium', '["Verify fill-in-the-blank compartment accuracy from Quiz #3."]'::jsonb, '["List all inputs and outputs of cytosolic glycolysis."]'::jsonb, false, 'Eliminates compartment confusion before re-testing.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000007', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 3, 'Day 3 (Nov 15)', 'Genetics', 'Biology', 'Concept Revision', 'Replication Fork Polarity & Meiotic Recombination', 60, 'High', '["Consolidate 5-prime to 3-prime synthesis rules for leading and lagging strands.","Review Prophase I chiasmata crossing over and independent assortment."]'::jsonb, '["Diagram a replication fork showing helicase, primase, DNA Pol III, and ligase."]'::jsonb, false, 'Medium status (64% accuracy) - close to crossing the 75% Strong threshold.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000008', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 3, 'Day 3 (Nov 15)', 'Genetics', 'Biology', 'Practice Questions', 'Practice Set: Mendelian Dihybrid Ratios & Okazaki Fragments', 30, 'Medium', '["Complete 5 medium/hard questions on Chapter 2."]'::jsonb, '["Predict recombinant gamete frequencies for linked vs unlinked genes."]'::jsonb, false, 'Strengthens application accuracy under timed exam conditions.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000009', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 3, 'Day 3 (Nov 15)', 'Photosynthesis', 'Biology', 'Mistake Review', 'Spaced Retrieval Check: Calvin Cycle Stoichiometry', 30, 'High', '["Recall 3-PGA reduction and RuBP regeneration without notes."]'::jsonb, '["Write the balanced energy inputs required per G3P synthesized."]'::jsonb, false, '48-hour spaced repetition check on your #1 weakest topic.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000010', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 4, 'Day 4 (Nov 16)', 'Human Physiology', 'Biology', 'Concept Revision', 'Cardiac Conduction System, Bohr Effect & Nephron Transport', 60, 'High', '["Trace excitation from SA node to AV node delay and Purkinje fibers.","Explain sodium-glucose cotransport in the proximal convoluted tubule."]'::jsonb, '["Explain why the AV node delay is essential for ventricular filling."]'::jsonb, false, 'Medium status (67% accuracy) with 5 past-paper questions.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000011', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 4, 'Day 4 (Nov 16)', 'Human Physiology', 'Biology', 'Practice Questions', 'Practice Questions: Oxygen Dissociation Curves & Synapses', 30, 'Medium', '["Interpret rightward vs leftward shifts of hemoglobin curves."]'::jsonb, '["Solve 2025 past-paper question on muscular exercise and blood pH."]'::jsonb, false, 'Builds confidence from 67% toward Strong (>75%) mastery.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000012', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 4, 'Day 4 (Nov 16)', 'Respiration', 'Biology', 'Mistake Review', 'Spaced Retrieval Check: Chemiosmosis in Cristae vs Thylakoids', 30, 'High', '["Compare proton gradient direction in mitochondria and chloroplasts."]'::jsonb, '["Complete side-by-side comparison table from memory."]'::jsonb, false, 'Reinforces both Weak energetics topics simultaneously.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000013', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 5, 'Day 5 (Nov 17)', 'Cell Biology', 'Biology', 'Concept Revision', 'Rapid Synthesis: Membrane Transport & Full Syllabus Integration', 60, 'Review', '["Connect membrane transport (Chapter 1) to nephron reabsorption and chemiosmosis."]'::jsonb, '["Review Na+/K+ pump coupling with secondary active glucose transport."]'::jsonb, false, 'Strong topic (83%) used as a conceptual bridge across all units.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000014', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 5, 'Day 5 (Nov 17)', 'Photosynthesis', 'Biology', 'Practice Questions', 'Full Re-Test Verification: Energetics & Molecular Biology', 30, 'Critical', '["Achieve >=75% accuracy on a fresh RAG-grounded Diagnostic Quiz."]'::jsonb, '["Launch a 6-question Diagnostic Quiz covering Photosynthesis and Respiration."]'::jsonb, false, 'Final verification step in the UPLOAD -> DIAGNOSE -> PLAN -> RE-TEST loop.', now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '85000000-0000-0000-0000-000000000015', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 5, 'Day 5 (Nov 17)', 'Respiration', 'Biology', 'Mistake Review', 'Final Pre-Exam Mistake Audit', 30, 'Medium', '["Confirm zero remaining Weak classifications in Gap Analysis report."]'::jsonb, '["Verify all high-frequency past-paper concepts."]'::jsonb, false, 'Ensures exam readiness before November 18 target date.', now()
) ON CONFLICT (id) DO NOTHING;

-- 11. Progress History (Preserving Quiz Attempts)
INSERT INTO public.progress_history (
    id, student_id, quiz_id, attempt_number, quiz_title, subject_name, accuracy_percent, total_score, max_score, duration_seconds, completed_at
) VALUES (
    '90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 1, 'Biology Baseline Diagnostic Assessment #1', 'Biology', 42, 1, 4, 480, '2026-11-06T14:08:00.000Z'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.progress_history (
    id, student_id, quiz_id, attempt_number, quiz_title, subject_name, accuracy_percent, total_score, max_score, duration_seconds, completed_at
) VALUES (
    '90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 2, 'Cellular & Molecular Checkpoint Quiz #2', 'Biology', 56, 3, 5, 530, '2026-11-08T16:39:00.000Z'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.progress_history (
    id, student_id, quiz_id, attempt_number, quiz_title, subject_name, accuracy_percent, total_score, max_score, duration_seconds, completed_at
) VALUES (
    '90000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 3, 'Comprehensive Biology Diagnostic Assessment #3', 'Biology', 67, 4, 6, 615, '2026-11-11T10:25:15.000Z'
) ON CONFLICT (id) DO NOTHING;
