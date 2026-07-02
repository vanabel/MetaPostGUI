circleit.a(btex Essai etex);
a.c = (0,0);
a.dx = a.dy;
drawunboxed(a);
for i=0 step 10 until 360:
draw (0,0) -- 1cm*right rotated i cutbefore bpath.a;
endfor;
