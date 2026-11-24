-- Keep historical drafts readable while preventing new blank bodies.
CREATE FUNCTION "validate_outreach_body"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."body" !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'Outreach body must contain text.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Pitch_nonempty_body"
BEFORE INSERT OR UPDATE OF "body" ON "Pitch"
FOR EACH ROW EXECUTE FUNCTION "validate_outreach_body"();
