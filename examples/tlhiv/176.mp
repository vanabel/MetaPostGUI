path c[], l[];
sphere_with_holes(6);
def ellipse(expr a,b,c,d,e) =
draw curve(a,b,c,d,e) ;
draw curve(c,d,a,b,e) dashed evenly;
enddef;
ellipse (l[0], 2/3, l[2], 1/3, 4);
ellipse (l[1], 2/3, l[3], 1/3, 4);
ellipse (l[2], 2/3, l[4], 1/3, 4);
ellipse (l[3], 2/3, l[5], 1/3, 4);
ellipse (l[4], 2/3, l[0], 1/3, 4);
ellipse (l[5], 2/3, l[1], 1/3, 4);
