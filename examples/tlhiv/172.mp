path p;
p := (-1cm,0) .. (1cm,-1cm) .. (8mm,0)
.. (1cm,1cm) .. (-1cm,1cm) .. cycle;
z0 = (-2cm,0);
draw p withpen pencircle scaled 1bp;
draw z0 withpen pencircle scaled 3pt;
draw cardiodide(p,z0);
