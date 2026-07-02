vardef trace_trapezes (suffix f)(expr a,b,inc) =
save i; numeric i;
for i=a step inc until b-inc:
path p;
p = (i,0)--(i+inc,0)--(i+inc,f(i+inc))--(i,f(i))--cycle;
p := p scaled 1cm;
fill p withcolor .8*white;
draw p;
endfor;
enddef;
vardef f(expr x) = 4 - x**2 enddef;
trace_trapezes(f,-2,2,.5);
draw trace(f, -2,2,.1);
axes;
