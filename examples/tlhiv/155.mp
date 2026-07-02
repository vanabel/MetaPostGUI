vardef f(expr x,y) = sind(x/u*180)*sind(y/u*180)*u enddef;
boolean dessine_fil_de_fer;  dessine_fil_de_fer := false;
color   dessine_couleur;     dessine_couleur    := red+green;
vardef dessine(suffix f)(expr xmin, xmax, xinc, ymin, ymax, yinc) =
save i,j,p,dfdx,dfdy,project;
vardef project(expr x,y,z) =
x*(-1,-1) + y*(1,0) + z*(0,1)
enddef;
for i=m step inc until M:
for j=m step inc until M:
path p;
p = project(i,j,f(i,j)) --
project(i,j+inc,f(i,j+inc)) --
project(i+inc,j+inc,f(i+inc,j+inc)) --
project(i+inc,j,f(i+inc,j)) --
cycle;
dfdx := (f(i,j) - f(i+inc,j))/inc;
dfdy := (f(i,j) - f(i,j+inc))/inc;
couleur := 1/sqrt( dfdx**2 + dfdy**2 + 1);
fill p withcolor couleur*dessine_couleur;
if dessine_fil_de_fer: draw p fi;
endfor
endfor;
enddef;
vardef f(expr x,y) = sind(x/u*180)*sind(y/u*180)*u enddef;
dessine(f,-2u,2u,.1u, -2u,2u,.1u);
