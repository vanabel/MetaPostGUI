u:=1u;
path p,q,r;
p:=(-4u,-2u)..(-1u,2u)..(3u,1u);
q:=(-4u,2u)--(0u,-1u)--(4u,2u);
r:=0.4[point 0 of p, point 0 of q]..0.4[point 1 of p, point 1 of q]..0.4[point 2 of p, point 2 of q];
draw p dashed evenly;
draw q dashed evenly;
draw r withpen pencircle scaled 1.2pt;
