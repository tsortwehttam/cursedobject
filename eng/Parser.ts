import peggy from "peggy";
import type { FacProgram } from "./AST";

const GRAMMAR = String.raw`
{{
  const R  = (segs) => ({ t: "ref", segs });
  const S  = (v)    => ({ t: "str", v });
  const Rx = (v, f) => ({ t: "regex", v, flags: f });
  const N  = (v)    => ({ t: "num", v });
  const IO = (kind, raw) => ({ t: "io",   kind, raw: raw.trim() });
  const CO = (kind, raw) => ({ t: "cond", kind, raw: raw.trim() });
}}

Program
  = _ nodes:Handler* _ { return nodes; }

Handler
  = slots:SlotList cond:Cond? body:Body
    { return cond == null ? { slots, body } : { slots, cond, body }; }

SlotList
  = first:Slot rest:(__inl s:Slot { return s; })* { return [first, ...rest]; }

Body
  = _ "{" _ stmts:Stmt* "}" _ { return stmts; }
  / _inl Terminator _         { return undefined; }

Terminator
  = ";"
  / "\n"
  / &"}"
  / !.

Stmt
  = IfBlock
  / SwitchBlock
  / Handler

Cond
  = __inl "if" WB __inl expr:RawUntilBrace { return expr.trim(); }

// ---------- Control flow ----------

IfBlock
  = "{{#if" __ e:RawUntilTplClose "}}" _
    then_:Stmt*
    elsifs:ElsifClause*
    els:ElseClause?
    "{{#end}}" _
    {
      const body = [
        { slots: [CO("cond", e)], body: then_ },
        ...elsifs,
      ];
      if (els) body.push(els);
      return { slots: [CO("if", "")], body };
    }

ElsifClause
  = "{{#elsif" __ e:RawUntilTplClose "}}" _ body:Stmt*
    { return { slots: [CO("cond", e)], body }; }

ElseClause
  = "{{#else}}" _ body:Stmt*
    { return { slots: [CO("default", "")], body }; }

SwitchBlock
  = "{{#switch" __ e:RawUntilTplClose "}}" _
    cases:CaseClause*
    def:DefaultClause?
    "{{#end}}" _
    {
      const body = [...cases];
      if (def) body.push(def);
      return { slots: [CO("switch", e)], body };
    }

CaseClause
  = "{{#case" __ m:RawUntilTplClose "}}" _ body:Stmt*
    { return { slots: [CO("case", m)], body }; }

DefaultClause
  = "{{#default}}" _ body:Stmt*
    { return { slots: [CO("default", "")], body }; }

// ---------- Slots ----------

Slot
  = RestMarker
  / IOSlot
  / StrSlot
  / RegexSlot
  / NumSlot
  / AssignOp
  / RefSlot

// Rest marker — matches zero-or-more trailing event slots in query patterns.
RestMarker
  = "..." { return { t: "rest" }; }

// Assignment-operator aliases for the "set" verb: := and = both desugar to set.
AssignOp
  = ":=" { return R([{ wild: false, v: "set" }]); }
  / "="  { return R([{ wild: false, v: "set" }]); }

RefSlot
  = head:RefSeg tail:("." s:RefSeg { return s; })*
    { return R([head, ...tail]); }

RefSeg
  = "$" v:WildName { return { wild: true,  v }; }
  / "*" !("*")    { return { wild: true,  v: "_" }; }
  / !Reserved v:Ident { return { wild: false, v }; }

Reserved
  = ("if" / "{{#") WB

Ident "ident"
  = $([A-Za-z_][A-Za-z0-9_\-/]*)

WildName
  = $([A-Za-z0-9_]+)

StrSlot
  = '"' cs:DQChar* '"' { return S(cs.join("")); }
  / "'" cs:SQChar* "'" { return S(cs.join("")); }

DQChar = "\\" c:. { return c === "n" ? "\n" : c === "t" ? "\t" : c; } / [^"\\]
SQChar = "\\" c:. { return c === "n" ? "\n" : c === "t" ? "\t" : c; } / [^'\\]

RegexSlot
  = "/" body:RegexBody "/" flags:$[gimsuy]* { return Rx(body, flags); }

RegexBody
  = $(("\\" .) / [^/\n])+

NumSlot
  = n:$("-"? [0-9]+ ("." [0-9]+)?) &WB { return N(Number(n)); }

IOSlot
  = "<<#" _ kind:Ident _ raw:RawUntilIOClose { return IO(kind, raw); }

// ---------- Raw capture ----------

RawUntilIOClose  = s:$((!">>" .)*) ">>"  { return s; }
RawUntilTplClose = $((!"}}" .)*)
RawUntilBrace    = $((!"{" .)*)

// ---------- Whitespace ----------

WB = ![A-Za-z0-9_]
// Any whitespace including newlines — used between handlers, inside blocks, etc.
_  = ([ \t\r\n] / Comment)*
__ = ([ \t\r\n] / Comment)+
// Inline whitespace only — used between slots on one stmt line so newlines can terminate.
_inl  = ([ \t\r] / Comment)*
__inl = ([ \t\r] / Comment)+
Comment
  = "//" [^\n]*
  / "/*" (!"*/" .)* "*/"
`;

let _parser: peggy.Parser | null = null;

function getParser(): peggy.Parser {
  if (!_parser) _parser = peggy.generate(GRAMMAR);
  return _parser;
}

// Parse a single slot-pattern string (e.g. "* sayto Trip ..." or "$a sayto Trip $b") into
// a FacNode head. Reuses the main grammar by wrapping with a trailing `;`.
export function parsePattern(pattern: string): import("./AST").FacNode {
  const program = parse(pattern.trim() + " ;");
  if (program.length !== 1) throw new Error(`invalid pattern: ${pattern}`);
  return program[0];
}

export function parse(source: string): FacProgram {
  return getParser().parse(source) as FacProgram;
}
