boxit.a1(btex $a$ etex);
boxit.b1(btex etex);
boxit.a2(btex $b$ etex);
boxit.b2(btex etex);
boxit.a3(btex $c$ etex);
boxit.b3(btex etex);
boxit.a4(btex $d$ etex);
boxit.b4(btex etex);
for i=1 upto 4:
a[i].e = b[i].w;
b[i].e + (5mm,0) = a[i+1].w;
a[i].n - a[i].s = a[i+1].n - a[i+1].s = b[i].n - b[i].s ;
b[i].e - b[i].w = (2mm,0);
endfor;
drawboxed(a1,b1,a2,b2,a3,b3,a4,b4);
for i=1 upto 3:
drawarrow b[i].c {up} .. a[i+1].c {down}
cutafter bpath.a[i+1];
endfor;
