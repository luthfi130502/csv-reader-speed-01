// Single-pass reader for broken CSV text, written from scratch to match
// csv-reader 1.0.0's answers exactly: { columns, rows, errors }.
// One left-to-right sweep, fields cut with slices, no regex, no per-char
// string building on the common path, and no helper call per field.
export function run(input) {
  const s = input.text;
  const header = input.header;
  const n = s.length;
  let i = 0;
  if (n > 0 && s.charCodeAt(0) === 0xfeff) i = 1;
  let line = 1;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let ord = 0;

  const rowOf = (o) => (header ? (o === 0 ? null : o - 1) : o);

  while (i < n) {
    // Skip lines left with no characters: LF or CRLF at record start.
    for (;;) {
      if (i >= n) break;
      const c = s.charCodeAt(i);
      if (c === 10) {
        i++;
        line++;
        continue;
      }
      if (c === 13) {
        if (s.charCodeAt(i + 1) === 10) {
          i += 2;
          line++;
          continue;
        }
        errors.push({ code: "stray_cr", line: line, row: rowOf(ord) });
        i++;
        continue;
      }
      break;
    }
    if (i >= n) break;

    const startLine = line;
    const fields = [];

    for (;;) {
      let term;
      let quoted = i < n && s.charCodeAt(i) === 34;
      let close = -1;
      let doubled = false;
      let hasCR = false;
      let nl = 0;
      if (quoted) {
        // One sweep finds the closing quote (a doubled "" is one literal),
        // and counts the line breaks and CRs inside it.
        let j = i + 1;
        while (j < n) {
          const ch = s.charCodeAt(j);
          if (ch === 34) {
            if (s.charCodeAt(j + 1) === 34) {
              doubled = true;
              j += 2;
              continue;
            }
            close = j;
            break;
          }
          if (ch === 10) {
            nl++;
          } else if (ch === 13) {
            hasCR = true;
            nl++;
            if (s.charCodeAt(j + 1) === 10) j++;
          }
          j++;
        }
        if (close === -1) {
          // Never closes: the quote is literal, the rest reads unquoted.
          errors.push({
            code: "unterminated_quote",
            line: startLine,
            row: rowOf(ord),
          });
          quoted = false;
        }
      }
      if (quoted) {
        let field;
        if (!hasCR && !doubled) {
          field = s.slice(i + 1, close);
          line += nl;
        } else if (!hasCR) {
          const parts = [];
          let seg = i + 1;
          let p = i + 1;
          for (;;) {
            const q = s.indexOf('"', p);
            if (q === -1 || q >= close) break;
            parts.push(s.slice(seg, q), '"');
            p = q + 2;
            seg = q + 2;
          }
          parts.push(s.slice(seg, close));
          field = parts.join("");
          line += nl;
        } else {
          const parts = [];
          let seg = i + 1;
          for (let k = i + 1; k < close; k++) {
            const ch = s.charCodeAt(k);
            if (ch === 34) {
              parts.push(s.slice(seg, k), '"');
              k++;
              seg = k + 1;
            } else if (ch === 13) {
              parts.push(s.slice(seg, k), "\n");
              if (s.charCodeAt(k + 1) === 10) k++;
              seg = k + 1;
            }
          }
          parts.push(s.slice(seg, close));
          field = parts.join("");
          line += nl;
        }
        // Junk after the closing quote, up to comma or line break.
        let p = close + 1;
        let junkParts = null;
        let junk = "";
        for (;;) {
          let k = p;
          while (k < n) {
            const ch = s.charCodeAt(k);
            if (ch === 44 || ch === 10 || ch === 13) break;
            k++;
          }
          if (k >= n) {
            if (junkParts) {
              junkParts.push(s.slice(p, k));
              junk = junkParts.join("");
            } else {
              junk = s.slice(close + 1, k);
            }
            i = k;
            term = "eof";
            break;
          }
          const ch = s.charCodeAt(k);
          if (ch === 13 && s.charCodeAt(k + 1) !== 10) {
            errors.push({ code: "stray_cr", line: startLine, row: rowOf(ord) });
            if (!junkParts) junkParts = [s.slice(close + 1, k)];
            else junkParts.push(s.slice(p, k));
            p = k + 1;
            continue;
          }
          if (junkParts) {
            junkParts.push(s.slice(p, k));
            junk = junkParts.join("");
          } else {
            junk = s.slice(close + 1, k);
          }
          if (ch === 44) {
            i = k + 1;
            term = "comma";
          } else if (ch === 10) {
            i = k + 1;
            term = "eol";
          } else {
            i = k + 2;
            term = "eol";
          }
          break;
        }
        if (junk.length > 0) {
          errors.push({ code: "quote_junk", line: startLine, row: rowOf(ord) });
        }
        fields.push(junk.length > 0 ? field + junk : field);
      } else {
        // Unquoted field: quotes are literal, a lone CR is dropped
        // (stray_cr) and the field goes on.
        const start = i;
        let p = start;
        let parts = null;
        for (;;) {
          let k = p;
          while (k < n) {
            const ch = s.charCodeAt(k);
            if (ch === 44 || ch === 10 || ch === 13) break;
            k++;
          }
          if (k >= n) {
            if (parts) {
              parts.push(s.slice(p, k));
              fields.push(parts.join(""));
            } else {
              fields.push(s.slice(start, k));
            }
            i = k;
            term = "eof";
            break;
          }
          const ch = s.charCodeAt(k);
          if (ch === 13 && s.charCodeAt(k + 1) !== 10) {
            errors.push({ code: "stray_cr", line: startLine, row: rowOf(ord) });
            if (!parts) parts = [s.slice(start, k)];
            else parts.push(s.slice(p, k));
            p = k + 1;
            continue;
          }
          if (parts) {
            parts.push(s.slice(p, k));
            fields.push(parts.join(""));
          } else {
            fields.push(s.slice(start, k));
          }
          if (ch === 44) {
            i = k + 1;
            term = "comma";
          } else if (ch === 10) {
            i = k + 1;
            term = "eol";
          } else {
            i = k + 2;
            term = "eol";
          }
          break;
        }
      }
      if (term === "eol") line++;
      if (term === "comma") continue;
      break;
    }

    if (ord === 0) {
      width = fields.length;
      if (header) columns = fields;
      else rows.push(fields);
    } else {
      const row = header ? ord - 1 : ord;
      if (fields.length < width) {
        errors.push({
          code: "short_row",
          line: startLine,
          row: row,
          fields: fields.length,
        });
        while (fields.length < width) fields.push("");
        rows.push(fields);
      } else if (fields.length > width) {
        const extra = fields.slice(width);
        errors.push({ code: "long_row", line: startLine, row: row, extra: extra });
        fields.length = width;
        rows.push(fields);
      } else {
        rows.push(fields);
      }
    }
    ord++;
  }

  return { columns: columns, rows: rows, errors: errors };
}
