CREATE OR REPLACE FUNCTION generate_job_ref()
RETURNS TRIGGER AS $$
DECLARE
    today_date TEXT;
    max_num INTEGER;
    new_ref TEXT;
BEGIN
    today_date := TO_CHAR(NOW(), 'YYYYMMDD');
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(job_ref FROM 'NFD-[0-9]{8}-([0-9]+)') AS INTEGER)
    ), 0) INTO max_num
    FROM jobs
    WHERE job_ref LIKE 'NFD-' || today_date || '-%';
    new_ref := 'NFD-' || today_date || '-' || LPAD((max_num + 1)::TEXT, 3, '0');
    NEW.job_ref := new_ref;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
