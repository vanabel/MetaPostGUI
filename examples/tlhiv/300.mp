vardef TEX primary s =
write "verbatimtex"                    to "mptextmp.mp";
write "\documentclass[12pt]{article}"  to "mptextmp.mp";
write "\usepackage[T1]{fontenc}"       to "mptextmp.mp";
write "\usepackage{amsmath,amssymb}"   to "mptextmp.mp";
write "\begin{document}"               to "mptextmp.mp";
write "etex"                           to "mptextmp.mp";
write "btex "&s&" etex"                to "mptextmp.mp";
write EOF                              to "mptextmp.mp";
scantokens "input mptextmp"
enddef;
vardef mylabel(expr pic, p, t) =
save A; pair A;
A = point t of p +
8bp * unitvector(direction t of p) rotated 90;
label(pic, A);
enddef;
path p; u:=1cm;
p = (0,0)..(-u,u)..(u,u);
draw p;
for i=0 step .2 until length(p):
draw point i of p withpen pencircle scaled 4bp;
mylabel(TEX("$"&decimal(round(5*i))&"$"),p,i);
endfor;
