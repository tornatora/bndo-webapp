-- Seed tenders used as initial dataset.
insert into public.tenders (
  authority_name,
  title,
  cpv_code,
  procurement_value,
  deadline_at,
  summary,
  dossier_url,
  supplier_portal_url
)
values
  (
    'Comune di Milano',
    'Servizio manutenzione impianti elettrici edifici comunali',
    '50711000-2',
    1250000.00,
    now() + interval '24 days',
    'Appalto triennale per manutenzione ordinaria e straordinaria impianti elettrici su 42 edifici comunali. Requisiti principali: SOA OS30 classifica III, ISO 9001, reperibilita H24.',
    'https://www.ariaspa.it/',
    'https://www.acquistinretepa.it/'
  ),
  (
    'ASL Roma 1',
    'Fornitura dispositivi medicali monouso e supporto logistico',
    '33140000-3',
    830000.00,
    now() + interval '15 days',
    'Procedura aperta con criterio OEPV. Richiesta tracciabilita lotti, certificazioni CE e capacita di consegna in 48 ore per urgenze ospedaliere.',
    'https://www.aslroma1.it/',
    'https://piattaforma.aslroma1.it/'
  ),
  (
    'Regione Emilia-Romagna',
    'Servizi digitali per gestione pratiche SUAP e integrazione SPID/CIE',
    '72230000-6',
    2450000.00,
    now() + interval '32 days',
    'Affidamento quadriennale per evoluzione applicativa, manutenzione e supporto utenti. Richieste competenze su cloud pubblico, sicurezza OWASP e integrazione pagoPA.',
    'https://intercenter.regione.emilia-romagna.it/',
    'https://piattaformaintercenter.regione.emilia-romagna.it/'
  ),
  (
    'Autorita di Sistema Portuale del Mar Tirreno',
    'Servizi di vigilanza armata e controllo accessi area portuale',
    '79713000-5',
    1960000.00,
    now() + interval '18 days',
    'Servizio H24 su 4 varchi portuali con centrale operativa. Requisiti: licenza prefettizia, certificazione UNI 10891, personale con formazione antincendio alto rischio.',
    'https://www.adspmarligureorientale.it/',
    'https://gare.adsp.it/'
  ),
  (
    'Universita degli Studi di Padova',
    'Facility management integrato per plessi universitari',
    '79993100-2',
    3120000.00,
    now() + interval '41 days',
    'Lotto unico per manutenzione impianti, presidio tecnico e reportistica energetica. Richiesta piattaforma CAFM e piano KPI mensile con penalita su SLA.',
    'https://www.unipd.it/',
    'https://appalti.unipd.it/'
  ),
  (
    'Comune di Bari',
    'Servizi di refezione scolastica con criteri CAM',
    '55524000-9',
    2680000.00,
    now() + interval '27 days',
    'Contratto pluriennale con menu stagionali, approvvigionamento filiera corta e controllo qualita HACCP. Prevista quota minima prodotti biologici certificati.',
    'https://www.comune.bari.it/',
    'https://gare.comune.bari.it/'
  )
on conflict do nothing;
