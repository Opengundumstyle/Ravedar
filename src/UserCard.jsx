function UserCard({ user }) {
  return (
    <div className="bg-black/20 backdrop-blur-lg rounded-2xl shadow-lg flex flex-col items-center w-[448px] h-[600px] mx-auto transition-all duration-300 p-1 cursor-pointer">
      <div className="bg-black/20 backdrop-blur-lg rounded-2xl flex flex-col items-center w-full h-full p-0 relative">
        {/* Photo area: full height with overlay */}
        <div className="w-full h-full flex-shrink-0 flex justify-center items-center">
          <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center">
            {user.photos && user.photos.length > 0 ? (
              <img
                src={user.photos[0].image_url}
                alt="User pic"
                className="w-full h-full object-cover object-center bg-gray-100"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">No Photo</div>
            )}
          </div>
        </div>
        {/* Info area: overlay on bottom */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col justify-end w-full h-[210px] px-4 py-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent rounded-b-2xl">
          {/* Name and Instagram - fixed height */}
          <div className="h-8 font-bold text-lg sm:text-xl md:text-2xl text-white text-center truncate w-full">
            {user.name} {user.instagram && <span className="text-gray-200 text-base">@{user.instagram}</span>}
          </div>
          {/* About Me - fixed height */}
          <div className="h-[72px] text-sm sm:text-base text-gray-100 text-center w-full overflow-hidden">
            <p className="line-clamp-3">{user.about_me}</p>
          </div>
          {/* Tags - fixed height */}
          {user.vibe_tags && user.vibe_tags.length > 0 && (
            <div className="h-12 flex flex-wrap gap-1.5 justify-center items-center overflow-hidden px-2">
              {user.vibe_tags.map((tag, i) => (
                <span key={i} className="bg-white/20 text-white px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap backdrop-blur-sm">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserCard; 